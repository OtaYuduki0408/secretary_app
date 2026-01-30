document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        console.error('Login form not found.');
        return;
    }

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault(); // フォームの通常の送信をキャンセル

        const emailInput = loginForm.querySelector('input[name="email"]');
        const passwordInput = loginForm.querySelector('input[name="password"]');

        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            alert('メールアドレスとパスワードを入力してください。');
            return;
        }

        // Androidのネイティブ機能を呼び出す
        if (window.AndroidSync && typeof window.AndroidSync.signIn === 'function') {
            console.log(`Attempting to sign in with email: ${email}`);
            const resultJson = window.AndroidSync.signIn(email, password);
            
            try {
                const result = JSON.parse(resultJson);
                if (result.success) {
                    console.log('Sign in successful, reloading to main page.');
                    // ログイン成功後、キャッシュをクリアしてリロードするネイティブメソッドを呼び出すのが望ましい
                    if (window.AndroidSync && typeof window.AndroidSync.clearCacheAndReload === 'function') {
                        window.AndroidSync.clearCacheAndReload();
                    } else {
                        window.location.href = 'main.html';
                    }
                } else {
                    console.error('Sign in failed:', result.error);
                    alert(`ログインに失敗しました: ${result.error}`);
                }
            } catch (e) {
                console.error('Failed to parse sign in result:', e);
                alert('ログイン処理で予期せぬエラーが発生しました。');
            }
        } else {
            console.error('AndroidSync.signIn function is not available.');
            alert('ログイン機能が利用できません。アプリのバージョンを確認してください。');
        }
    });
});
