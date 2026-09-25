/* eslint-disable react-hooks/set-state-in-effect */
import { MinusCircle, PlusCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Button, Dialog, Field, Input, Notice, Textarea } from './ui';

export interface AdjustmentStudent { id: number; name: string; remainingHundredths: number }
interface Adjustment { id: number; amount_hundredths: number; note: string; created_at: string; operator_name: string }

export function AdjustmentDialog({ item, onClose, onSaved }: { item: AdjustmentStudent | null; onClose: () => void; onSaved: (remainingHundredths: number) => void }) {
  const [hours, setHours] = useState('');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [note, setNote] = useState('');
  const [records, setRecords] = useState<Adjustment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    if (item) api<Adjustment[]>(`/users/${item.id}/adjustments`).then(setRecords).catch(() => setRecords([]));
    setHours(''); setDirection('add'); setNote(''); setError(''); setRequestId('');
  }, [item?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    const amount = Math.round(Number(hours) * 100) * (direction === 'add' ? 1 : -1);
    if (!Number.isFinite(amount) || amount === 0) { setError('请输入非零课时'); return; }
    const operationId = requestId || crypto.randomUUID();
    if (!requestId) setRequestId(operationId);
    setBusy(true); setError('');
    try {
      const saved = await api<{ remainingHundredths: number }>(`/users/${item.id}/adjust-hours`, {
        method: 'POST', body: JSON.stringify({ amountHundredths: amount, note, requestId: operationId }),
      });
      setRequestId('');
      onSaved(saved.remainingHundredths);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '调整失败'); }
    finally { setBusy(false); }
  }

  return <Dialog open={Boolean(item)} title={`调整课时 · ${item?.name ?? ''}`} onClose={onClose} wide>
    <form className="dialog-form" onSubmit={submit}>
      <Notice error={error} />
      <p className="muted">当前预计剩余 <strong>{((item?.remainingHundredths ?? 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时</strong>。仅供参考，具体以排课记录为准。</p>
      <div className="adjust-row"><div className="segment"><button type="button" className={direction === 'add' ? 'active' : ''} onClick={() => setDirection('add')}><PlusCircle size={16} />增加</button><button type="button" className={direction === 'subtract' ? 'active' : ''} onClick={() => setDirection('subtract')}><MinusCircle size={16} />减少</button></div><Field label="课时数量"><Input required min="0.01" step="0.01" type="number" value={hours} onChange={(event) => setHours(event.target.value)} /></Field></div>
      <Field label="调整备注"><Textarea required maxLength={200} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="说明调整原因" /></Field>
      <footer><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy}>确认调整</Button></footer>
    </form>
    <div className="adjust-history"><h3>最近调整记录</h3>{records.length ? <ul>{records.map((record) => <li key={record.id}><span className={record.amount_hundredths > 0 ? 'positive' : 'negative'}>{record.amount_hundredths > 0 ? '+' : ''}{record.amount_hundredths / 100}</span><div><strong>{record.note}</strong><small>{record.operator_name} · {new Date(record.created_at).toLocaleString('zh-CN')}</small></div></li>)}</ul> : <p>暂无人工调整记录</p>}</div>
  </Dialog>;
}
