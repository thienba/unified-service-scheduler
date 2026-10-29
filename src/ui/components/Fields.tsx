// design.md 8.6. Label above the field, helper and error below, a 44px control, 16px text.
// They work with React Hook Form (`{...register("name")}`) and on their own. The drop-down, date and time
// controls are Select, DatePicker and TimeField (8.27 to 8.30), in their own files.
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { useId } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export function fieldId(name: string | undefined, fallback: string): string {
  return name ? `field-${name}` : fallback;
}

/** The parts a person can focus: a date's segments come before its calendar button. */
const focusable =
  'input:not([type="hidden"]),textarea,button,[role="spinbutton"]';

/**
 * Moves focus to a field by its id, or to the first control inside a group: the button of a Select or
 * TimeField, the first segment of a DatePicker (design.md 8.27, forms).
 */
export function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches(focusable)
    ? el
    : el.querySelector<HTMLElement>(focusable);
  target?.focus();
}

export function FieldError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="flex items-start gap-2 text-sm text-text-danger">
      <Icon name="alert" className="mt-1" />
      <span>{children}</span>
    </p>
  );
}

interface FieldChrome {
  label: string;
  helper?: string | undefined;
  /** The words of the problem. Name the field and the rule; never repeat what was typed. */
  error?: string | undefined;
  required?: boolean;
}

const controlBase =
  "min-h-(--size-field) w-full rounded-control border border-border-strong bg-surface px-3 text-text transition-colors duration-(--duration-fast) ease-out placeholder:text-text-secondary hover:border-text disabled:border-border-subtle disabled:bg-surface-sunken disabled:text-text-secondary disabled:hover:border-border-subtle";
const controlError =
  "border-text-danger inset-ring inset-ring-text-danger hover:border-text-danger";

function Message({
  id,
  error,
  helper,
}: {
  id: string;
  error?: string | undefined;
  helper?: string | undefined;
}) {
  if (error) return <FieldError id={id}>{error}</FieldError>;
  if (helper)
    return (
      <p id={id} className="text-sm text-text-secondary">
        {helper}
      </p>
    );
  return null;
}

type InputProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, "required"> & {
    ref?: Ref<HTMLInputElement>;
  };

export function TextField({
  label,
  helper,
  error,
  required,
  className,
  id,
  ...input
}: InputProps) {
  const fallback = useId();
  const key = id ?? fieldId(input.name, fallback);
  const messageId = `${key}-message`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={key} className="font-medium">
        {label}
        {required ? " (required)" : ""}
      </label>
      <input
        id={key}
        type="text"
        className={cx(controlBase, error && controlError, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? messageId : undefined}
        aria-required={required || undefined}
        {...input}
      />
      <Message id={messageId} error={error} helper={helper} />
    </div>
  );
}

export function TelField(props: InputProps) {
  return <TextField type="tel" inputMode="tel" autoComplete="tel" {...props} />;
}

export function EmailField(props: InputProps) {
  return (
    <TextField type="email" inputMode="email" autoComplete="email" {...props} />
  );
}

export interface Choice {
  value: string;
  label: string;
  icon?: IconName;
  description?: string;
  disabled?: boolean;
  /** Written under a disabled choice: "Not available at this time". */
  disabledReason?: string;
}

/** A group of native radios drawn as rows, with no choice made until the person makes one. */
export function ChoiceCards({
  legend,
  name,
  choices,
  value,
  onChange,
  onBlur,
  error,
  required,
  ref,
}: {
  legend: string;
  name: string;
  choices: readonly Choice[];
  value?: string | undefined;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string | undefined;
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const id = fieldId(name, name);
  const messageId = `${id}-message`;
  return (
    <fieldset
      id={id}
      className="m-0 grid min-w-0 gap-2 border-0 p-0"
      aria-describedby={error ? messageId : undefined}
    >
      <legend className="mb-2 p-0 font-semibold">
        {legend}
        {required ? " (required)" : ""}
      </legend>
      {choices.map((c, index) => (
        <label key={c.value} className="group relative block">
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === undefined ? undefined : value === c.value}
            disabled={c.disabled}
            ref={index === 0 ? ref : undefined}
            onChange={() => onChange?.(c.value)}
            onBlur={onBlur}
            className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            className={cx(
              "flex min-h-(--size-target) items-center gap-3 rounded-control border border-border-strong bg-surface px-4 py-2 transition-colors duration-(--duration-base) ease-out",
              "peer-hover:border-text peer-checked:border-surface-selected peer-checked:bg-surface-selected peer-checked:text-text-on-selected",
              "peer-focus-visible:outline-solid peer-focus-visible:outline-(length:--focus-ring-width) peer-focus-visible:outline-focus-ring peer-focus-visible:outline-offset-(--focus-ring-offset)",
              "peer-disabled:border-border-subtle peer-disabled:bg-surface-sunken peer-disabled:text-text-secondary",
              error && "border-2 border-text-danger",
            )}
          >
            {c.icon && <Icon name={c.icon} />}
            <span>
              {c.label}
              {c.description && (
                <small className="block text-sm">{c.description}</small>
              )}
              {c.disabled && c.disabledReason && (
                <small className="block text-sm">{c.disabledReason}</small>
              )}
            </span>
            <Icon
              name="check"
              className="invisible ms-auto group-has-checked:visible"
            />
          </span>
        </label>
      ))}
      {error && <FieldError id={messageId}>{error}</FieldError>}
    </fieldset>
  );
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  ref?: Ref<HTMLInputElement>;
};

/** A 44px row with the label to the right. */
export function Checkbox({ label, id, ...input }: CheckProps) {
  const fallback = useId();
  const key = id ?? fieldId(input.name, fallback);
  return (
    <div className="flex min-h-(--size-target) items-center gap-3">
      <input
        id={key}
        type="checkbox"
        className="m-0 size-(--size-icon) accent-surface-selected"
        {...input}
      />
      <label htmlFor={key}>{label}</label>
    </div>
  );
}

/** A switch with "On" or "Off" written next to it, never colour alone. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-(--size-target) items-center gap-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="m-0 size-(--size-icon) accent-surface-selected"
      />
      <label htmlFor={id}>{label}</label>
      <span className="text-sm text-text-secondary" aria-hidden="true">
        {checked ? "On" : "Off"}
      </span>
    </div>
  );
}
