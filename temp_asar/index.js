const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function convertPath(inputPath) {
    // UNIXスタイルのパス
    const unixStyle = inputPath.replace(/\\/g, '/');
    
    // Windowsスタイルのパス
    const winStyle = inputPath.replace(/\//g, '\\');
    
    // FileMaker相対パス
    const fmRelative = 'file:../' + unixStyle;
    
    // FileMaker Mac相対パス
    const fmMacRelative = 'filemac:../' + unixStyle;
    
    // FileMaker Windows相対パス
    const fmWinRelative = 'filewin:../' + winStyle;
    
    // FileMaker Mac完全パス
    const fmMacFull = 'filemac:/' + unixStyle;
    
    // FileMaker Windows完全パス
    const fmWinFull = 'filewin:/' + winStyle;

    console.log('\n変換結果:');
    console.log('UNIXパス:', unixStyle);
    console.log('Windowsパス:', winStyle);
    console.log('FileMaker相対パス:', fmRelative);
    console.log('FileMaker Mac相対パス:', fmMacRelative);
    console.log('FileMaker Windows相対パス:', fmWinRelative);
    console.log('FileMaker Mac完全パス:', fmMacFull);
    console.log('FileMaker Windows完全パス:', fmWinFull);
}

console.log('パス変換ツール');
console.log('変換したいパスを入力してください（終了するには Ctrl+C）:');

rl.on('line', (input) => {
    if (input.trim()) {
        convertPath(input.trim());
        console.log('\n次のパスを入力してください:');
    }
});

rl.on('close', () => {
    console.log('\nアプリケーションを終了します。');
    process.exit(0);
}); 