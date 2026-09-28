import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User } from "../api";

export function ProfilePage() {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    api<{ user: User | null }>("/api/python/me").then((data) => setUser(data.user)).catch(() => setUser(null));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNote("");
    try {
      if (mode === "register") {
        const data = await api<{ user: User }>("/api/python/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
        setUser(data.user);
      } else if (mode === "login") {
        const data = await api<{ user: User }>("/api/python/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setUser(data.user);
      } else if (!token) {
        const data = await api<{ dev_token?: string }>("/api/python/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
        setNote(data.dev_token ? `Код для локальной проверки: ${data.dev_token}` : "Если почта есть в системе, код создан.");
      } else {
        await api("/api/python/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
        setNote("Пароль обновлён. Теперь можно войти.");
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Ошибка");
    }
  }

  return (
    <div className="narrow">
      <h1>Профиль</h1>
      {user ? (
        <>
          <p>
            Вы вошли как {user.name}. Оценки и черновики сохраняются для этого входа.
          </p>
          <p>
            <Link to="/programs/python/certificate/basics">Сертификат раздела</Link>
            {" · "}
            <Link to="/programs/python/diploma">Диплом</Link>
          </p>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <div className="auth-tabs">
            <button type="button" className={mode === "login" ? "auth-tab on" : "auth-tab"} onClick={() => setMode("login")}>
              Вход
            </button>
            <button type="button" className={mode === "register" ? "auth-tab on" : "auth-tab"} onClick={() => setMode("register")}>
              Регистрация
            </button>
            <button type="button" className={mode === "reset" ? "auth-tab on" : "auth-tab"} onClick={() => setMode("reset")}>
              Новый пароль
            </button>
          </div>
          {mode === "register" && <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя" aria-label="Имя" />}
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Почта" aria-label="Почта" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" type="password" aria-label="Пароль" />
          {mode === "reset" && <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Код сброса" aria-label="Код сброса" />}
          <button type="submit">{mode === "reset" ? "Сменить пароль" : "Продолжить"}</button>
        </form>
      )}
      {note && <p>{note}</p>}
    </div>
  );
}
