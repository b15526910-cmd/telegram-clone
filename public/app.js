let config = null;
let supabase = null;
let currentUser = null;
let currentChat = null;
let chats = [];
let contacts = [];
let messages = [];
let messageSubscription = null;
let agoraClient = null;
let localAudioTrack = null;

const appEl = document.getElementById('app');

window.startCall = startCall;
window.logout = logout;
window.createChatWithUser = createChatWithUser;
window.selectChat = selectChat;
window.submitLogin = submitLogin;
window.submitRegister = submitRegister;

async function init() {
  try {
    config = await loadConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      appEl.innerHTML = '<div class="error-box">Ошибка: не задана конфигурация Supabase. Установите SUPABASE_URL и SUPABASE_ANON_KEY.</div>';
      return;
    }

    supabase = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const sessionResult = await supabase.auth.getSession();
    if (sessionResult?.data?.session) {
      await restoreProfile();
    }
    renderApp();
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.access_token) {
        await restoreProfile();
      } else {
        currentUser = null;
        currentChat = null;
        chats = [];
        messages = [];
        renderApp();
      }
    });
  } catch (err) {
    console.error(err);
    appEl.innerHTML = '<div class="error-box">Ошибка инициализации приложения.</div>';
  }
}

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Не удалось загрузить конфигурацию');
  return res.json();
}

async function restoreProfile() {
  const userResult = await supabase.auth.getUser();
  if (!userResult?.data?.user?.id) {
    currentUser = null;
    return;
  }

  const profile = await supabase
    .from('profiles')
    .select('id, email, username, avatar, status')
    .eq('id', userResult.data.user.id)
    .single();

  if (profile.error) {
    console.error('Не удалось загрузить профиль:', profile.error);
    currentUser = null;
    return;
  }

  currentUser = profile.data;
  await loadChats();
  await loadContacts();
}

function renderApp() {
  if (!currentUser) {
    renderAuthView();
  } else {
    renderMainView();
  }
}

function renderAuthView() {
  appEl.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Telegram Clone</h1>
        <p>Регистрация по email + пароль и уникальный username через Supabase</p>
        <div class="auth-fields">
          <label>Почта</label>
          <input id="auth-email" type="email" placeholder="you@example.com" />
          <label>Пароль</label>
          <input id="auth-password" type="password" placeholder="••••••••" />
          <label>Username (опционально)</label>
          <input id="auth-username" type="text" placeholder="your_name" />
        </div>
        <div class="auth-actions">
          <button class="button primary" onclick="submitLogin()">Войти</button>
          <button class="button secondary" onclick="submitRegister()">Зарегистрироваться</button>
        </div>
        <div id="auth-error" class="error-text"></div>
      </div>
    </div>
  `;
}

function renderMainView() {
  appEl.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-head">
          <div>
            <div class="subtitle">Привет,</div>
            <div class="title">${escapeHtml(currentUser.username)}</div>
          </div>
          <button class="button small" onclick="logout()">Выйти</button>
        </div>
        <div class="sidebar-actions">
          <button class="button primary" onclick="renderContacts()">Новый чат</button>
        </div>
        <div class="section-title">Чаты</div>
        <div id="chat-list" class="sidebar-list"></div>
        <div class="section-title">Контакты</div>
        <div id="contacts-list" class="sidebar-list"></div>
      </aside>
      <section class="main-panel">
        <div class="main-header">
          <div>
            <div class="subtitle">${currentChat ? 'Чат с' : 'Выберите чат'}</div>
            <div class="title">${currentChat ? escapeHtml(currentChat.name) : 'Нажмите на контакт в списке слева'}</div>
          </div>
          <div class="header-actions">
            ${currentChat ? '<button class="button secondary" onclick="startCall()">Звонок Agora</button>' : ''}
          </div>
        </div>
        <div class="messages-panel" id="messages-view"></div>
        ${currentChat ? `
          <form id="message-form" class="message-form" onsubmit="event.preventDefault(); sendMessage();">
            <input id="message-input" type="text" placeholder="Введите сообщение..." autocomplete="off" />
            <button class="button primary" type="submit">Отправить</button>
          </form>
        ` : ''}
      </section>
    </div>
  `;

  renderChats();
  renderContacts();
  if (currentChat) {
    renderMessages();
    setupMessageInput();
  }
}

function renderChats() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  list.innerHTML = chats.map(chat => {
    return `<div class="chat-item ${currentChat?.id === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
      <div class="chat-item-title">${escapeHtml(chat.name || 'Новый чат')}</div>
      <div class="chat-item-subtitle">${escapeHtml(chat.last_message || 'Нет сообщений')}</div>
    </div>`;
  }).join('') || '<div class="empty-state">Нет чатов</div>';
}

function renderContacts() {
  const list = document.getElementById('contacts-list');
  if (!list) return;
  list.innerHTML = contacts.map(user => {
    const safeUsername = JSON.stringify(user.username);
    return `<div class="contact-item" onclick="createChatWithUser('${user.id}', ${safeUsername})">
      <div>${escapeHtml(user.username)}</div>
      <div class="contact-email">${escapeHtml(user.email)}</div>
    </div>`;
  }).join('') || '<div class="empty-state">Нет контактов</div>';
}

function renderMessages() {
  const view = document.getElementById('messages-view');
  if (!view) return;

  if (!currentChat) {
    view.innerHTML = '<div class="empty-state">Выберите чат, чтобы начать переписку.</div>';
    return;
  }

  if (!messages.length) {
    view.innerHTML = '<div class="empty-state">Начните переписку в этом чате.</div>';
    return;
  }

  view.innerHTML = messages.map(msg => {
    const mine = msg.sender_id === currentUser.id;
    return `
      <div class="message-item ${mine ? 'mine' : 'remote'}">
        <div class="message-bubble">${escapeHtml(msg.content)}</div>
        <div class="message-meta">${mine ? 'Вы' : escapeHtml(msg.sender_username || 'Собеседник')}</div>
      </div>
    `;
  }).join('');
  view.scrollTop = view.scrollHeight;
}

function setupMessageInput() {
  const input = document.getElementById('message-input');
  if (input) {
    input.focus();
  }
}

async function loadChats() {
  try {
    const membership = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', currentUser.id);

    if (membership.error) {
      console.error('Ошибка загрузки чатов:', membership.error);
      return;
    }

    const chatIds = membership.data.map(item => item.chat_id);
    if (!chatIds.length) {
      chats = [];
      return;
    }

    const chatResult = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)
      .order('last_message_time', { ascending: false });

    if (chatResult.error) {
      console.error('Ошибка загрузки чатов:', chatResult.error);
      return;
    }

    chats = chatResult.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function loadContacts() {
  try {
    const users = await supabase
      .from('profiles')
      .select('id, username, email')
      .neq('id', currentUser.id)
      .order('username', { ascending: true });

    if (users.error) {
      console.error('Ошибка загрузки контактов:', users.error);
      contacts = [];
      return;
    }

    contacts = users.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function selectChat(chatId) {
  currentChat = chats.find(chat => chat.id === chatId) || null;
  if (!currentChat) return;
  await loadMessages(chatId);
  await subscribeMessages(chatId);
  renderApp();
}

async function loadMessages(chatId) {
  try {
    const messagesResult = await supabase
      .from('messages')
      .select('id, chat_id, sender_id, sender_username, content, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (messagesResult.error) {
      console.error('Ошибка загрузки сообщений:', messagesResult.error);
      messages = [];
      return;
    }

    messages = messagesResult.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function subscribeMessages(chatId) {
  if (messageSubscription) {
    await supabase.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  messageSubscription = supabase
    .channel(`messages-${chatId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `chat_id=eq.${chatId}`
    }, (payload) => {
      if (payload?.new) {
        messages.push(payload.new);
        renderMessages();
      }
    })
    .subscribe();
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input || !input.value.trim() || !currentChat) return;

  const content = input.value.trim();
  input.value = '';

  const { error } = await supabase
    .from('messages')
    .insert([{ chat_id: currentChat.id, sender_id: currentUser.id, sender_username: currentUser.username, content }]);

  if (error) {
    console.error('Ошибка при отправке сообщения:', error);
    return;
  }

  await supabase
    .from('chats')
    .update({ last_message: content, last_message_time: new Date().toISOString() })
    .eq('id', currentChat.id);

  await loadChats();
  renderChats();
}

async function createChatWithUser(userId, username) {
  try {
    const membershipResult = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', currentUser.id);

    if (membershipResult.error) {
      console.error('Ошибка создания чата:', membershipResult.error);
      return;
    }

    const chatIds = membershipResult.data.map(item => item.chat_id);
    if (chatIds.length) {
      const partnerResult = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', userId)
        .in('chat_id', chatIds);

      if (partnerResult.error) {
        console.error('Ошибка поиска чата:', partnerResult.error);
      } else if (partnerResult.data.length) {
        const existingChatId = partnerResult.data[0].chat_id;
        await loadChats();
        currentChat = chats.find(chat => chat.id === existingChatId) || null;
        if (currentChat) {
          await loadMessages(currentChat.id);
          await subscribeMessages(currentChat.id);
          renderApp();
          return;
        }
      }
    }

    const chatResult = await supabase
      .from('chats')
      .insert([{ type: 'private', name: username, last_message_time: new Date().toISOString() }])
      .select()
      .single();

    if (chatResult.error) {
      console.error('Ошибка создания чата:', chatResult.error);
      return;
    }

    await supabase.from('chat_members').insert([
      { chat_id: chatResult.data.id, user_id: currentUser.id },
      { chat_id: chatResult.data.id, user_id }
    ]);

    await loadChats();
    currentChat = chatResult.data;
    await loadMessages(currentChat.id);
    await subscribeMessages(currentChat.id);
    renderApp();
  } catch (err) {
    console.error(err);
  }
}

async function startCall() {
  if (!currentChat || !config.agoraAppId) {
    alert('Звонок недоступен. Проверьте AGORA_APP_ID в настройках.');
    return;
  }

  try {
    if (agoraClient) {
      await leaveCall();
      return;
    }

    agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    await agoraClient.join(config.agoraAppId, `chat-${currentChat.id}`, null, null);
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await agoraClient.publish([localAudioTrack]);

    agoraClient.on('user-published', async (user, mediaType) => {
      if (mediaType === 'audio') {
        await agoraClient.subscribe(user, 'audio');
        user.audioTrack.play();
      }
    });

    agoraClient.on('user-unpublished', (user) => {
      console.log('Пользователь вышел из звонка:', user.uid);
    });

    document.body.classList.add('in-call');
    alert('Вы вошли в голосовой канал Agora. Нажмите кнопку еще раз, чтобы выйти.');
  } catch (err) {
    console.error('Ошибка звонка Agora:', err);
    alert('Не удалось подключиться к звонку. Проверьте App ID.');
  }
}

async function leaveCall() {
  if (!agoraClient) return;
  if (localAudioTrack) {
    localAudioTrack.stop();
    localAudioTrack.close();
  }
  await agoraClient.leave();
  agoraClient = null;
  localAudioTrack = null;
  document.body.classList.remove('in-call');
  alert('Вы вышли из звонка.');
}

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  currentChat = null;
  messages = [];
  renderApp();
}

async function submitLogin() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const errorEl = document.getElementById('auth-error');

  if (!email || !password) {
    if (errorEl) errorEl.textContent = 'Введите email и пароль';
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();
    if (!response.ok) {
      if (errorEl) errorEl.textContent = result.error || 'Ошибка входа';
      return;
    }

    await supabase.auth.setSession(result.session);
    await restoreProfile();
    renderApp();
  } catch (err) {
    console.error(err);
    if (errorEl) errorEl.textContent = 'Ошибка входа';
  }
}

async function submitRegister() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const username = document.getElementById('auth-username')?.value?.trim();
  const errorEl = document.getElementById('auth-error');

  if (!email || !password) {
    if (errorEl) errorEl.textContent = 'Введите email и пароль';
    return;
  }

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username })
    });

    const result = await response.json();
    if (!response.ok) {
      if (errorEl) errorEl.textContent = result.error || 'Ошибка регистрации';
      return;
    }

    await supabase.auth.setSession(result.session);
    await restoreProfile();
    renderApp();
  } catch (err) {
    console.error(err);
    if (errorEl) errorEl.textContent = 'Ошибка регистрации';
  }
}

function escapeHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
