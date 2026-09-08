import { useEffect, useState } from "react";
import type { AppSettings } from "../types";

/** 可选值列表（带 datalist，既可选择也可手动输入） */
const AUTH_TYPES = ["local"];
const ACTIONS = ["local_login"];
const PALANGS = ["ch", "en"];

interface Props {
  settings: AppSettings | null;
  onSave: (settings: Partial<AppSettings>) => Promise<void>;
}

export default function SettingsPanel({ settings, onSave }: Props) {
  const [form, setForm] = useState<AppSettings | null>(settings);
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!form) {
    return (
      <div className="card">
        <h2>服务器与登录</h2>
        <p className="hint">加载中…</p>
      </div>
    );
  }

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...form,
        // 不记住密码时不保存密码
        password: form.remember ? form.password : "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>服务器与登录</h2>

      <div className="field">
        <label>服务器地址（自签名 HTTPS 已兼容）</label>
        <input
          type="text"
          value={form.server_url}
          placeholder="https://xx.xx.xx.xx:1443"
          onChange={(e) => set("server_url", e.target.value.trim())}
        />
      </div>

      <div className="field">
        <label>用户名（username）</label>
        <input
          type="text"
          value={form.username}
          onChange={(e) => set("username", e.target.value.trim())}
        />
      </div>

      <div className="field">
        <label>密码（password）</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type={showPwd ? "text" : "password"}
            style={{ flex: 1 }}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
          <button type="button" className="ghost" onClick={() => setShowPwd((v) => !v)}>
            {showPwd ? "隐藏" : "显示"}
          </button>
        </div>
      </div>

      <div className="field">
        <label>认证方式（auth_type_name）</label>
        <input
          list="auth-type-options"
          value={form.auth_type_name}
          onChange={(e) => set("auth_type_name", e.target.value.trim())}
        />
        <datalist id="auth-type-options">
          {AUTH_TYPES.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <label>验证码（verify_code）</label>
        <input
          type="text"
          value={form.verify_code}
          onChange={(e) => set("verify_code", e.target.value)}
        />
      </div>
      <div className="field">
        <label>邮箱验证码（email_code）</label>
        <input
          type="text"
          value={form.email_code}
          onChange={(e) => set("email_code", e.target.value)}
        />
      </div>
      <div className="field">
        <label>登录动作（action）</label>
        <input
          list="action-options"
          value={form.action}
          onChange={(e) => set("action", e.target.value.trim())}
        />
        <datalist id="action-options">
          {ACTIONS.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label>语言（palang）</label>
        <input
          list="palang-options"
          value={form.palang}
          onChange={(e) => set("palang", e.target.value.trim())}
        />
        <datalist id="palang-options">
          {PALANGS.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.remember}
          onChange={(e) => set("remember", e.target.checked)}
        />
        记住账号密码（保存在本地数据库）
      </label>

      <button
        className="primary full-width"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "保存中…" : "保存设置"}
      </button>
      <p className="hint" style={{ marginTop: 10 }}>
        同步时会以这些参数登录 <code>login/user.cgi</code> 并上传
        <code>mac.conf</code>（GB2312 编码，覆盖导入）。
      </p>
    </div>
  );
}
