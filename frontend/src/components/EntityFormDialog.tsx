import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Input, Label, Select } from "@/components/ui/primitives";

export interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: readonly string[];
  required?: boolean;
  min?: number;
  step?: number;
  help?: string;
  colSpan?: 1 | 2;
}

export type FormValues = Record<string, string>;

/** Small, typed form-in-a-dialog used by the CRUD screens. Values are strings; pages convert on submit. */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial: FormValues;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: FormValues) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="max-w-xl">
        {/* Mounted fresh on every open, so the form always starts from `initial`. */}
        <FormBody fields={fields} initial={initial} submitLabel={submitLabel} busy={busy} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  fields,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  fields: FieldSpec[];
  initial: FormValues;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      const v = values[f.name]?.trim() ?? "";
      if (f.required && !v) return setError(`${f.label} is required.`);
      if (f.type === "number" && v && (Number.isNaN(Number(v)) || (f.min != null && Number(v) < f.min))) {
        return setError(`${f.label} must be a number${f.min != null ? ` ≥ ${f.min}` : ""}.`);
      }
    }
    onSubmit(values);
  };

  return (
        <form onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => {
              const id = `f-${f.name}`;
              return (
                <div key={f.name} className={f.colSpan === 2 ? "col-span-2 space-y-1" : "col-span-2 space-y-1 sm:col-span-1"}>
                  <Label htmlFor={id}>
                    {f.label}
                    {f.required ? <span aria-hidden className="text-danger-fg"> *</span> : null}
                  </Label>
                  {f.type === "select" ? (
                    <Select id={id} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      type={f.type === "number" ? "number" : "text"}
                      min={f.min}
                      step={f.step}
                      required={f.required}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  )}
                  {f.help ? <p className="text-xs text-muted">{f.help}</p> : null}
                </div>
              );
            })}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger-fg">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
  );
}
