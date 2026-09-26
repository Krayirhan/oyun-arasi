import { loadFirebaseClient } from './cloud-sync.js?v=202609270005';

const slot = document.querySelector('[data-account-root]');
if (slot) {
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'account-title');
  dialog.innerHTML = `
    <button class="account-close" type="button" aria-label="Pencereyi kapat">×</button>
    <div class="account-content"></div>`;
  document.body.append(dialog);

  const button = document.createElement('button');
  button.className = 'account-button';
  button.type = 'button';
  button.textContent = 'Giriş yap';
  let platformFirebase = null;
  let unavailable = false;
  let renderedUid = null;
  button.addEventListener('click', () => {
    if (unavailable) renderUnavailable();
    else { view = 'signin'; renderDialog(platformFirebase?.auth.currentUser || null); }
  });
  slot.append(button);

  const content = dialog.querySelector('.account-content');
  dialog.querySelector('.account-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  // signin | signup | reset (girişsiz) · account | delete (girişli)
  let view = 'signin';
  const eyebrow = '<p class="account-eyebrow">OYUN ARASI HESABI</p>';

  async function client() {
    platformFirebase ||= (await loadFirebaseClient()).platformFirebase;
    return platformFirebase;
  }

  function setButton(user) {
    button.textContent = user ? (user.displayName || 'Hesabım') : 'Giriş yap';
    button.setAttribute('aria-label', user ? `Hesap: ${user.displayName || user.email}` : 'Giriş yap veya hesap oluştur');
  }

  function renderDialog(user = null, message = '', tone = 'error') {
    renderedUid = user?.uid || null;
    const status = `<p class="account-error${tone === 'ok' ? ' account-ok' : ''}" role="status">${escapeHtml(message)}</p>`;
    if (user && view === 'delete') renderDelete(user, status);
    else if (user) renderAccount(user, status);
    else if (view === 'reset') renderReset(status);
    else renderSignIn(view === 'signup', status);
    if (!dialog.open) dialog.showModal();
  }

  function renderAccount(user, status) {
    const verify = user.emailVerified ? '' : `<p class="account-verify">E-posta adresin henüz doğrulanmadı. <button class="account-switch" id="account-resend" type="button">Bağlantıyı tekrar gönder</button></p>`;
    content.innerHTML = `${eyebrow}<h2 id="account-title">Merhaba${user.displayName ? `, ${escapeHtml(user.displayName)}` : ''}</h2><p class="account-copy">Oyun ilerlemen hesabında saklanıyor.</p><p class="account-email">${escapeHtml(user.email || '')}</p>${verify}<button class="account-submit" id="account-signout" type="button">Çıkış yap</button>${status}<button class="account-switch account-danger" id="account-delete" type="button">Hesabımı sil</button>`;
    content.querySelector('#account-signout').addEventListener('click', async () => {
      try { await platformFirebase.signOut(); dialog.close(); }
      catch { renderDialog(user, 'Çıkış yapılamadı. Tekrar dene.'); }
    });
    content.querySelector('#account-resend')?.addEventListener('click', async () => {
      try { await platformFirebase.resendVerification(); renderDialog(user, 'Doğrulama bağlantısı e-postana gönderildi.', 'ok'); }
      catch (error) { renderDialog(user, authErrorMessage(error)); }
    });
    content.querySelector('#account-delete').addEventListener('click', () => { view = 'delete'; renderDialog(user); });
  }

  function renderDelete(user, status) {
    content.innerHTML = `${eyebrow}<h2 id="account-title">Hesabını sil</h2><p class="account-copy">Hesabın, profilin ve bulutta saklanan tüm oyun kayıtların kalıcı olarak silinir. Bu işlem geri alınamaz. Bu cihazdaki oyun kayıtları yerinde kalır.</p><form class="account-form" id="account-form"><label>Onaylamak için şifreni yaz<input name="password" type="password" autocomplete="current-password" required></label><button class="account-submit account-danger-fill" type="submit">Hesabımı kalıcı olarak sil</button></form>${status}<button class="account-switch" id="account-back" type="button">Vazgeç</button>`;
    content.querySelector('#account-back').addEventListener('click', () => { view = 'account'; renderDialog(user); });
    content.querySelector('#account-form').addEventListener('submit', async event => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get('password');
      const submit = content.querySelector('.account-submit');
      submit.disabled = true;
      try {
        await platformFirebase.deleteAccount(password);
        view = 'deleted';
        content.innerHTML = `${eyebrow}<h2 id="account-title">Hesabın silindi</h2><p class="account-copy">Bulutta saklanan tüm verilerin silindi. Oyunları hesapsız oynamaya devam edebilirsin.</p>`;
      } catch (error) {
        submit.disabled = false;
        renderDialog(user, authErrorMessage(error));
      }
    });
  }

  function renderReset(status) {
    content.innerHTML = `${eyebrow}<h2 id="account-title">Şifreni sıfırla</h2><p class="account-copy">Hesabının e-posta adresini yaz, şifre sıfırlama bağlantısı gönderelim.</p><form class="account-form" id="account-form"><label>E-posta<input name="email" type="email" autocomplete="email" required></label><button class="account-submit" type="submit">Bağlantı gönder</button></form>${status}<button class="account-switch" id="account-back" type="button">Girişe dön</button>`;
    content.querySelector('#account-back').addEventListener('click', () => { view = 'signin'; renderDialog(); });
    content.querySelector('#account-form').addEventListener('submit', async event => {
      event.preventDefault();
      const email = new FormData(event.currentTarget).get('email').trim();
      const submit = content.querySelector('.account-submit');
      submit.disabled = true;
      try {
        await (await client()).sendPasswordReset(email);
        renderDialog(null, 'Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderdik.', 'ok');
      } catch (error) {
        submit.disabled = false;
        renderDialog(null, authErrorMessage(error));
      }
    });
  }

  function renderSignIn(signup, status) {
    content.innerHTML = `${eyebrow}<h2 id="account-title">${signup ? 'Hesap oluştur' : 'Giriş yap'}</h2><p class="account-copy">${signup ? 'İlerlemeni cihazların arasında eşitle.' : 'Oyunlarına kaldığın yerden devam et.'}</p><form class="account-form" id="account-form">${signup ? '<label>Görünen ad<input name="displayName" type="text" maxlength="30" autocomplete="name" required></label>' : ''}<label>E-posta<input name="email" type="email" autocomplete="email" required></label><label>Şifre<input name="password" type="password" minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label><button class="account-submit" type="submit">${signup ? 'Kayıt ol' : 'Giriş yap'}</button></form>${status}${signup ? '' : '<button class="account-switch" id="account-forgot" type="button">Şifremi unuttum</button>'}<button class="account-switch" id="account-mode" type="button">${signup ? 'Hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}</button>`;
    content.querySelector('#account-mode').addEventListener('click', () => { view = signup ? 'signin' : 'signup'; renderDialog(); });
    content.querySelector('#account-forgot')?.addEventListener('click', () => { view = 'reset'; renderDialog(); });
    content.querySelector('#account-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submit = content.querySelector('.account-submit');
      submit.disabled = true;
      try {
        const firebase = await client();
        if (signup) await firebase.signUp(form.get('email').trim(), form.get('password'), form.get('displayName').trim());
        else await firebase.signIn(form.get('email').trim(), form.get('password'));
        view = 'account';
        setButton(firebase.auth.currentUser);
        if (signup) renderDialog(firebase.auth.currentUser, 'Hesabın oluşturuldu. Doğrulama bağlantısı e-postana gönderildi.', 'ok');
        else dialog.close();
      } catch (authError) {
        submit.disabled = false;
        renderDialog(null, authErrorMessage(authError));
      }
    });
  }

  function renderUnavailable() {
    content.innerHTML = `${eyebrow}<h2 id="account-title">Hesap servisine ulaşılamıyor</h2><p class="account-copy">Oyunlar bu cihazda kaydolmaya devam ediyor. Reklam engelleyiciyi kapatıp ya da bağlantını kontrol edip sayfayı yenileyerek tekrar deneyebilirsin.</p>`;
    if (!dialog.open) dialog.showModal();
  }

  loadFirebaseClient()
    .then(loaded => {
      platformFirebase = loaded.platformFirebase;
      platformFirebase.startLibrarySync();
      platformFirebase.onAuthStateChanged(user => {
        setButton(user);
        window.dispatchEvent(new CustomEvent('oyunarasi-auth-changed', { detail: { user } }));
        if (view === 'deleted') return;
        if (!user && view !== 'reset' && view !== 'signup') view = 'signin';
        // Aynı kullanıcı için pencere zaten açıksa yeniden çizilmez (mesajlar silinmesin).
        if (dialog.open && (user?.uid || null) !== renderedUid) renderDialog(user);
      });
    })
    .catch(() => {
      unavailable = true;
      if (dialog.open) renderUnavailable();
    });
}

function authErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'Bu e-posta adresiyle hesap zaten var.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/invalid-email': 'Geçerli bir e-posta adresi yaz.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/network-request-failed': 'İnternet bağlantını kontrol et.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.',
    'auth/requires-recent-login': 'Güvenlik için çıkış yapıp tekrar giriş yapman gerekiyor.',
    'auth/user-not-found': 'Bu e-posta adresiyle kayıtlı hesap bulunamadı.'
  };
  return messages[error?.code] || 'İşlem tamamlanamadı. Biraz sonra tekrar dene.';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
