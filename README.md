# telegram-clone
my telegram Web Messenger

## Supabase + Vercel setup

1. Создайте проект Supabase и добавьте таблицы из `supabase.sql`.
2. В Supabase установите переменные окружения:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGORA_APP_ID`
3. Разверните проект на Vercel. В `vercel.json` уже настроены статические файлы и API-функции.
4. При регистрации используется email + пароль, username генерируется автоматически или задаётся вручную.

## Файлы

- `public/index.html` — новый фронтенд на Supabase.
- `public/app.js` — новая логика авторизации, чатов и Agora звонков.
- `api/auth/register.js` — регистрация через Supabase Service Role.
- `api/auth/login.js` — логин через Supabase.
- `api/config.js` — возвращает runtime-конфигурацию.
- `supabase.sql` — шаблон схемы таблиц для Supabase.
