#!/usr/bin/env ruby
# frozen_string_literal: true

# Mac App Store 用プロビジョニングプロファイルを API で再作成し、build/ へ保存する。
# Usage: ruby scripts/asc-refresh-mac-profile.rb

require "base64"
require "digest"
require "json"
require "net/http"
require "openssl"
require "uri"

BUNDLE_ID = "jp.tomippe.pathconverter"
OUT_PATH = File.expand_path("../build/PathConverter.provisionprofile", __dir__)
PROFILE_NAME = "PathConverter_AppStore"

def load_env_file(path)
  expanded = File.expand_path(path)
  return unless File.file?(expanded)

  File.foreach(expanded) do |line|
    next if line.strip.empty? || line.lstrip.start_with?("#")

    key, value = line.strip.split("=", 2)
    next if key.to_s.empty? || value.nil? || ENV.key?(key)

    ENV[key] = value.gsub(/\A['"]|['"]\z/, "")
  end
end

load_env_file("~/.apple-env")

def b64url(data)
  Base64.urlsafe_encode64(data).delete("=")
end

def jwt_token
  pk = OpenSSL::PKey.read(File.read(File.expand_path(ENV.fetch("APP_STORE_CONNECT_API_KEY_KEY_FILEPATH"))))
  now = Time.now.to_i
  si = "#{b64url({ alg: "ES256", kid: ENV["APP_STORE_CONNECT_API_KEY_KEY_ID"], typ: "JWT" }.to_json)}." \
       "#{b64url({ iss: ENV["APP_STORE_CONNECT_API_KEY_ISSUER_ID"], iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }.to_json)}"
  der = pk.dsa_sign_asn1(Digest::SHA256.digest(si))
  seq = OpenSSL::ASN1.decode(der)
  sig = seq.value.map { |i| [i.value.to_s(16).rjust(64, "0")].pack("H*") }.join
  "#{si}.#{b64url(sig)}"
end

class ASC
  API = "https://api.appstoreconnect.apple.com"

  def initialize(token)
    @token = token
  end

  def get(path, params = {})
    request(:get, path, params)
  end

  def post(path, body)
    request(:post, path, {}, body)
  end

  def delete(path)
    request(:delete, path)
  end

  private

  def request(method, path, params = {}, body = nil)
    uri = URI("#{API}#{path}")
    uri.query = URI.encode_www_form(params) unless params.empty?
    klass = { get: Net::HTTP::Get, post: Net::HTTP::Post, delete: Net::HTTP::Delete }.fetch(method)
    req = klass.new(uri)
    req["Authorization"] = "Bearer #{@token}"
    req["Content-Type"] = "application/json"
    req.body = JSON.generate(body) if body
    res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
    parsed = res.body.to_s.empty? ? {} : JSON.parse(res.body)
    return parsed if res.is_a?(Net::HTTPSuccess)

    detail = parsed.dig("errors", 0, "detail") || parsed.dig("errors", 0, "title") || res.body
    raise "ASC #{res.code} #{path}: #{detail}"
  end
end

client = ASC.new(jwt_token)

bundle = client.get("/v1/bundleIds", "filter[identifier]" => BUNDLE_ID, "limit" => 1).fetch("data").first
abort "❌ bundleId #{BUNDLE_ID} not found" unless bundle
bundle_id_api = bundle.fetch("id")
puts "bundleId: #{BUNDLE_ID} (#{bundle_id_api})"

certs = client.get(
  "/v1/certificates",
  "filter[certificateType]" => "DISTRIBUTION",
  "limit" => 20
).fetch("data", [])
abort "❌ DISTRIBUTION (Apple Distribution) certificate not found" if certs.empty?

cert = certs.max_by { |c| c.dig("attributes", "expirationDate").to_s }
cert_id = cert.fetch("id")
puts "certificate: #{cert.dig('attributes', 'displayName')} (#{cert_id})"

existing = client.get(
  "/v1/profiles",
  "filter[profileType]" => "MAC_APP_STORE",
  "filter[name]" => PROFILE_NAME,
  "limit" => 20
).fetch("data", [])
existing.each do |p|
  puts "delete old profile #{p.fetch('id')} (#{p.dig('attributes', 'profileState')})"
  client.delete("/v1/profiles/#{p.fetch('id')}")
rescue RuntimeError => e
  puts "  ⚠️ delete skipped: #{e.message.split(':').last.strip}"
end

res = client.post(
  "/v1/profiles",
  data: {
    type: "profiles",
    attributes: {
      name: PROFILE_NAME,
      profileType: "MAC_APP_STORE"
    },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: bundle_id_api } },
      certificates: { data: [{ type: "certificates", id: cert_id }] }
    }
  }
)
profile_id = res.dig("data", "id")
content = res.dig("data", "attributes", "profileContent")
abort "❌ profileContent missing" if content.to_s.empty?

File.binwrite(OUT_PATH, Base64.decode64(content))
puts "✅ wrote #{OUT_PATH} (profile #{profile_id})"
