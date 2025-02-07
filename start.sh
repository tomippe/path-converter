#!/bin/bash

MAX_RETRIES=10
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
    echo "試行回数: $(($RETRY_COUNT + 1))/$MAX_RETRIES"
    
    # 依存関係のインストール
    npm install
    
    # アプリケーションのビルド
    npm run build
    
    # ビルドされたアプリケーションを開く
    open "dist/mac-arm64/パス変換ツール.app"
    
    # アプリケーションの起動を待つ
    sleep 5
    
    # プロセスの確認
    if pgrep -x "パス変換ツール" > /dev/null; then
        echo "アプリケーションが正常に起動しました"
        SUCCESS=true
    else
        echo "アプリケーションの起動に失敗しました。再試行します..."
        RETRY_COUNT=$((RETRY_COUNT + 1))
        
        # プロセスの強制終了（もし残っていれば）
        pkill -f "パス変換ツール"
        
        # 次の試行までの待機
        sleep 3
    fi
done

if [ "$SUCCESS" = false ]; then
    echo "最大試行回数に達しました。アプリケーションの起動に失敗しました。"
    exit 1
fi 