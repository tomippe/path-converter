#!/bin/bash

echo "ビルドを開始します..."
npm run build

build_status=$?
if [ $build_status -eq 0 ]; then
    echo "ビルド成功。アプリケーションを実行します..."
    # 詳細なログを有効化
    export ELECTRON_ENABLE_LOGGING=true
    export ELECTRON_ENABLE_STACK_DUMPING=true
    export ELECTRON_DEBUG_NOTIFICATIONS=true
    export ELECTRON_ENABLE_DETAILED_LOGGING=true
    
    ./dist/mac-arm64/パス変換ツール.app/Contents/MacOS/パス変換ツール 2>&1
    
    run_status=$?
    if [ $run_status -ne 0 ]; then
        echo "アプリケーションが異常終了しました。終了コード: $run_status"
        echo "終了コードの意味:"
        case $run_status in
            133)
                echo "Trace/BPT trap - V8エンジンでの実行時エラー"
                echo "- preloadスクリプトでの初期化エラーの可能性"
                echo "- ネイティブモジュールの読み込みエラーの可能性"
                echo "- メモリアクセス違反の可能性"
                ;;
            *)
                echo "予期しないエラー"
                ;;
        esac
    fi
else
    echo "ビルドに失敗しました。終了コード: $build_status"
fi 