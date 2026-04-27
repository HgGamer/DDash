import { useCallback, useEffect, useState } from 'react';
import type { ActiveSelection, Todo } from '@shared/types';

interface Props {
  active: ActiveSelection | null;
}

export function TodoView({ active }: Props) {
  const projectId = active?.projectId ?? null;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const reload = useCallback(async () => {
    if (!projectId) {
      setTodos([]);
      return;
    }
    const list = await window.api.todos.list(projectId);
    setTodos(list);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!projectId) {
    return (
      <div className="todo-view">
        <div className="todo-view-header">
          <span className="todo-view-title">Todos</span>
        </div>
        <div className="todo-view-empty">Select a project to manage todos.</div>
      </div>
    );
  }

  const onAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    const created = await window.api.todos.add({ projectId, text });
    setDraft('');
    if (created) setTodos((cur) => [...cur, created]);
  };

  const onToggle = async (todo: Todo) => {
    const updated = await window.api.todos.update({
      projectId,
      id: todo.id,
      patch: { done: !todo.done },
    });
    if (updated) setTodos((cur) => cur.map((t) => (t.id === todo.id ? updated : t)));
  };

  const onRemove = async (todo: Todo) => {
    await window.api.todos.remove({ projectId, id: todo.id });
    setTodos((cur) => cur.filter((t) => t.id !== todo.id));
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const text = editingText.trim();
    const id = editingId;
    setEditingId(null);
    setEditingText('');
    if (!text) return;
    const updated = await window.api.todos.update({ projectId, id, patch: { text } });
    if (updated) setTodos((cur) => cur.map((t) => (t.id === id ? updated : t)));
  };

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div className="todo-view">
      <div className="todo-view-header">
        <span className="todo-view-title">Todos</span>
        <span className="todo-view-count">
          {open.length}/{todos.length}
        </span>
      </div>
      <div className="todo-view-add">
        <input
          className="todo-view-input"
          placeholder="Add a todo…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onAdd();
          }}
        />
        <button type="button" className="todo-view-btn" onClick={() => void onAdd()}>
          Add
        </button>
      </div>
      <div className="todo-view-body">
        {todos.length === 0 && (
          <div className="todo-view-empty">No todos yet. Add one above.</div>
        )}
        {open.length > 0 && (
          <ul className="todo-list">
            {open.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                editing={editingId === t.id}
                editingText={editingText}
                onToggle={() => void onToggle(t)}
                onRemove={() => void onRemove(t)}
                onStartEdit={() => startEdit(t)}
                onChangeEditing={setEditingText}
                onCommitEdit={() => void commitEdit()}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditingText('');
                }}
              />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <div className="todo-view-section">Done</div>
            <ul className="todo-list todo-list-done">
              {done.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  editing={editingId === t.id}
                  editingText={editingText}
                  onToggle={() => void onToggle(t)}
                  onRemove={() => void onRemove(t)}
                  onStartEdit={() => startEdit(t)}
                  onChangeEditing={setEditingText}
                  onCommitEdit={() => void commitEdit()}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditingText('');
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  todo: Todo;
  editing: boolean;
  editingText: string;
  onToggle: () => void;
  onRemove: () => void;
  onStartEdit: () => void;
  onChangeEditing: (s: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

function TodoRow({
  todo,
  editing,
  editingText,
  onToggle,
  onRemove,
  onStartEdit,
  onChangeEditing,
  onCommitEdit,
  onCancelEdit,
}: RowProps) {
  return (
    <li className={`todo-item ${todo.done ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.done}
        onChange={onToggle}
      />
      {editing ? (
        <input
          autoFocus
          className="todo-view-input"
          value={editingText}
          onChange={(e) => onChangeEditing(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <span className="todo-text" onDoubleClick={onStartEdit} title="Double-click to edit">
          {todo.text}
        </span>
      )}
      <button
        type="button"
        className="todo-view-remove"
        title="Remove"
        onClick={onRemove}
      >
        ✕
      </button>
    </li>
  );
}
