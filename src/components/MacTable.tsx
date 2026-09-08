import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { MacRecord, NewMacRecord } from "../types";

interface Props {
  records: MacRecord[];
  onAdd: (record: NewMacRecord) => Promise<void>;
  onUpdate: (id: number, record: NewMacRecord) => Promise<void>;
  onDelete: (ids: number[]) => Promise<void>;
  onClear: () => Promise<void>;
  onImport: (records: NewMacRecord[]) => Promise<void>;
}

const emptyForm: NewMacRecord = { mac: "", name: "", staff_id: "", remark: "" };

export default function MacTable({
  records,
  onAdd,
  onUpdate,
  onDelete,
  onClear,
  onImport,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<MacRecord | null>(null);
  const [form, setForm] = useState<NewMacRecord>(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.mac.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.staff_id.toLowerCase().includes(q) ||
        r.remark.toLowerCase().includes(q),
    );
  }, [records, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditing(null);
    setError("");
    setShowModal(true);
  };

  const openEdit = (r: MacRecord) => {
    setEditing(r);
    setForm({ mac: r.mac, name: r.name, staff_id: r.staff_id, remark: r.remark });
    setError("");
    setShowModal(true);
  };

  const submit = async () => {
    setError("");
    if (!form.mac.trim()) {
      setError("MAC 地址不能为空");
      return;
    }
    try {
      if (editing) {
        await onUpdate(editing.id, form);
      } else {
        await onAdd(form);
      }
      setShowModal(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((r) => r.id)),
    );
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条记录？`)) return;
    await onDelete([...selected]);
    setSelected(new Set());
  };

  const handleClear = async () => {
    if (records.length === 0) return;
    if (!confirm(`确定清空全部 ${records.length} 条记录？此操作不可恢复。`)) return;
    await onClear();
    setSelected(new Set());
  };

  const handleImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      const items: NewMacRecord[] = [];
      // 与 absort.js 一致：跳过前两行（表头+示例），列0=姓名、列1=工号、列3=MAC地址
      for (let i = 2; i < aoa.length; i++) {
        const row = aoa[i] || [];
        const mac = String(row[3] ?? "").trim();
        if (!mac) continue;
        items.push({
          mac,
          name: String(row[0] ?? "").trim(),
          staff_id: String(row[1] ?? "").trim(),
          remark: "",
        });
      }
      await onImport(items);
    } catch (err) {
      alert("Excel 解析失败: " + String(err));
    }
  };

  return (
    <>
      <div className="toolbar">
        <input
          type="text"
          placeholder="搜索 MAC / 姓名 / 工号 / 备注…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="count">
          共 {records.length} 条
          {search && `，匹配 ${filtered.length} 条`}
        </span>
        <div className="spacer" />
        <button className="primary" onClick={openAdd}>
          ＋ 添加
        </button>
        <button onClick={() => fileRef.current?.click()}>导入 Excel</button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
        <button
          onClick={handleDeleteSelected}
          disabled={selected.size === 0}
        >
          删除所选（{selected.size}）
        </button>
        <button className="danger" onClick={handleClear} disabled={records.length === 0}>
          清空
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                />
              </th>
              <th>MAC 地址</th>
              <th>姓名</th>
              <th>工号</th>
              <th>备注</th>
              <th>更新时间</th>
              <th style={{ width: 110 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={7}>
                  {records.length === 0
                    ? "暂无数据，点击“添加”或“导入 Excel”开始"
                    : "没有匹配的记录"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                  />
                </td>
                <td className="mac">{r.mac}</td>
                <td>{r.name}</td>
                <td>{r.staff_id}</td>
                <td>{r.remark}</td>
                <td style={{ color: "var(--text-dim)" }}>{r.updated_at}</td>
                <td className="actions">
                  <button className="link" onClick={() => openEdit(r)}>
                    编辑
                  </button>
                  <button
                    className="link danger"
                    onClick={async () => {
                      if (confirm(`确定删除 ${r.mac}？`)) {
                        await onDelete([r.id]);
                      }
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-mask" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "编辑记录" : "添加记录"}</h3>
            <div className="field">
              <label>MAC 地址 *</label>
              <input
                autoFocus
                value={form.mac}
                placeholder="如 AA:BB:CC:DD:EE:FF"
                onChange={(e) => setForm({ ...form, mac: e.target.value })}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>姓名</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>工号</label>
                <input
                  value={form.staff_id}
                  onChange={(e) =>
                    setForm({ ...form, staff_id: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>备注</label>
              <input
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className="primary" onClick={submit}>
                {editing ? "保存修改" : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
