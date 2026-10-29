// design.md 8.27 and 8.28 (D-0001-131). Our themed drop-down on React Aria Components: a button that shows the
// chosen value, and a listbox in a popover (or a bottom sheet on a phone). React Aria gives the roles, the keys
// (arrows, Home, End, Page Up and Down, typing to jump, Enter, Esc, Tab) and the focus handling; the look is ours,
// from the tokens only (app.css, "themed Select").
import type { Ref, RefObject } from "react";
import { useContext, useId, useLayoutEffect, useRef } from "react";
import {
  Button as AriaButton,
  I18nProvider,
  Label,
  ListBox,
  ListBoxItem,
  Select as AriaSelect,
  SelectStateContext,
  SelectValue,
  Text,
} from "react-aria-components";
import { Button } from "./Button";
import { cx } from "./cx";
import { fieldId } from "./Fields";
import { Icon, type IconName } from "./Icon";
import { Picker, PickerNote } from "./Picker";

export interface SelectOption {
  value: string;
  label: string;
  /** A second line: the technician's skills ("Service, brakes"). */
  description?: string;
  /** Set for an option that cannot be chosen: the reason, written under it ("Not offered at Northgate Motors."). */
  disabledReason?: string;
  /** What typing jumps by. A time's is its four digits ("0830"). */
  textValue?: string;
  /** Internal: a time that cannot be chosen is crossed out (8.30), its reason is the list's note. */
  struck?: boolean;
  /** Internal: a full hour in a list of times gets a line above it (8.30). */
  hour?: boolean;
}

/** React Aria keys cannot be empty, and an option may mean "nothing" ("Same as now"). */
const EMPTY_KEY = "(empty)";
const keyOf = (value: string) => (value === "" ? EMPTY_KEY : value);
const valueOf = (key: unknown) =>
  key === null || key === undefined || key === EMPTY_KEY ? "" : String(key);

export interface SelectProps {
  label: string;
  name?: string;
  id?: string;
  options: readonly SelectOption[];
  /** The chosen value. Empty shows the placeholder, unless an option has the empty value ("Same as now"). */
  value: string | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** The button: a form moves focus to it after a failed submit. */
  ref?: Ref<HTMLButtonElement>;
  /** A verb phrase: "Choose a service". */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Read-only: shown, focusable and readable, with a lock; it does not open. Say why in `helper`. */
  readOnly?: boolean;
  helper?: string | undefined;
  /** The words of the problem, shown under the control and tied to it. */
  error?: string | undefined;
  /** The red edge without a message of its own (a week row's one message, given by `describedBy`). */
  invalid?: boolean;
  describedBy?: string | undefined;
  /** `true` hides the label from sight (still the name); `"lg"` hides it from 1024 wide (a table header says it). */
  hideLabel?: boolean | "lg";
  /**
   * `field` fills its column; `bare` takes the free width (the phone schedule's stepper); `compact` is as wide as
   * its value (the header pickers; the caller sets the most it may take).
   */
  variant?: "field" | "compact" | "bare";
  icon?: IconName;
  /** Tabular figures for times. */
  numeric?: boolean;
  /** The options are still loading: the value reads `loadingText`, the list shows three skeleton rows. */
  loading?: boolean;
  loadingText?: string;
  /** The options failed to load: the list says so and offers Try again. */
  loadError?: string;
  onRetry?: () => void;
  /** No options: what is missing and what to do. */
  emptyText?: string;
  /** One line at the top of the list (under a sheet's title) about the options that cannot be chosen. */
  listNote?: string;
  /** `hours` draws a line above each full hour (a list of times). */
  listStyle?: "lines" | "hours";
  /** With no value, the list opens with this option in view and in focus (a list of times opens at 08:00). */
  openAt?: string;
  className?: string;
}

/** Keeps the chosen option (or `openAt`) three rows down from the top of the list when it opens (8.30). */
function OpenAt({
  listRef,
  target,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  target: string | undefined;
}) {
  const state = useContext(SelectStateContext);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || target === undefined) return;
    const row = [...list.querySelectorAll<HTMLElement>("[data-value]")].find(
      (r) => r.dataset["value"] === target,
    );
    if (!row) return;
    // In a popover the list scrolls; in a phone's sheet the sheet's body does.
    const box =
      list.scrollHeight > list.clientHeight
        ? list
        : (list.closest<HTMLElement>(".ctl-sheet-body") ?? list);
    const above =
      row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop = Math.max(0, box.scrollTop + above - row.offsetHeight * 3);
  }, [listRef, target]);
  useLayoutEffect(() => {
    if (!state || target === undefined || state.selectedKey !== null) return;
    // No value yet: the keyboard starts on `openAt`, not on the first option.
    const timer = setTimeout(() =>
      state.selectionManager.setFocusedKey(keyOf(target)),
    );
    return () => clearTimeout(timer);
  }, [state, target]);
  return null;
}

export function Select({
  label,
  name,
  id,
  options,
  value,
  onChange,
  onBlur,
  ref,
  placeholder,
  required,
  disabled = false,
  readOnly = false,
  helper,
  error,
  invalid = false,
  describedBy,
  hideLabel = false,
  variant = "field",
  icon = "down",
  numeric = false,
  loading = false,
  loadingText = "Loading…",
  loadError,
  onRetry,
  emptyText,
  listNote,
  listStyle = "lines",
  openAt,
  className,
}: SelectProps) {
  const fallback = useId();
  const key = id ?? fieldId(name, fallback);
  const noteId = `${key}-note`;
  const labelId = `${key}-label`;
  const valueId = `${key}-value`;
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const current = value ?? "";
  const hasEmptyOption = options.some((o) => o.value === "");
  const selectedKey = current === "" && !hasEmptyOption ? null : keyOf(current);
  const chosen = options.find((o) => o.value === current);
  const shown = loading
    ? loadingText
    : chosen
      ? chosen.label
      : current !== "" && !hasEmptyOption
        ? current
        : (placeholder ?? "");
  const isPlaceholder =
    loading || (!chosen && (current === "" || hasEmptyOption));
  const bad = Boolean(error) || invalid;
  // React Aria's Button passes on only the attributes a button may carry, so the two states it leaves out are set
  // here: invalid (read with the error, 8.27) and busy while the options load.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    for (const [name, on] of [
      ["aria-invalid", bad],
      ["aria-busy", loading],
    ] as const) {
      if (on) button.setAttribute(name, "true");
      else button.removeAttribute(name);
    }
  });
  const trailing: IconName = readOnly ? "lock" : loading ? "arc" : icon;
  const message = loadError ? (
    <div className="ctl-msg" role="alert">
      <p>{loadError}</p>
      {onRetry && (
        <Button icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  ) : loading ? (
    <div className="ctl-skel" role="status" aria-busy="true">
      <span className="sr-only">{loadingText}</span>
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  ) : options.length === 0 && emptyText ? (
    <div className="ctl-msg" role="status">
      <p>{emptyText}</p>
    </div>
  ) : null;

  return (
    <I18nProvider locale="en-GB">
      <AriaSelect
        selectedKey={selectedKey}
        onSelectionChange={(k) => {
          if (!readOnly) onChange(valueOf(k));
        }}
        isOpen={readOnly ? false : undefined}
        onBlur={onBlur}
        isDisabled={disabled}
        isInvalid={bad}
        allowsEmptyCollection={
          loading || Boolean(loadError) || options.length === 0
        }
        validationBehavior="aria"
        placeholder={placeholder}
        className={cx(
          "flex min-w-0 flex-col gap-1",
          variant === "bare" && "w-full",
          className,
        )}
      >
        <Label
          id={labelId}
          className={cx(
            hideLabel === true
              ? "sr-only"
              : hideLabel === "lg"
                ? "font-medium lg:sr-only"
                : "font-medium",
          )}
        >
          {label}
          {required ? " (required)" : ""}
        </Label>
        <AriaButton
          id={key}
          ref={(element: HTMLButtonElement | null) => {
            buttonRef.current = element;
            if (typeof ref === "function") ref(element);
            else if (ref) ref.current = element;
          }}
          data-value={current}
          // The label first, then the value: "Service (required) Full service" (8.27, names).
          aria-labelledby={`${labelId} ${valueId}`}
          aria-describedby={describedBy}
          className={cx(
            "ctl",
            variant !== "compact" && "ctl-fill",
            bad && "is-invalid",
            readOnly && "is-readonly",
            loading && "is-loading",
          )}
        >
          <SelectValue
            id={valueId}
            className={cx("ctl-value", numeric && "num")}
            data-placeholder={isPlaceholder || undefined}
          >
            {() => shown}
          </SelectValue>
          <Icon name={trailing} spin={trailing === "arc"} />
        </AriaButton>
        {error ? (
          <Text
            slot="errorMessage"
            elementType="p"
            className="flex items-start gap-2 text-sm text-text-danger"
          >
            <Icon name="alert" className="mt-1" />
            <span>{error}</span>
          </Text>
        ) : helper ? (
          <Text
            slot="description"
            elementType="p"
            className="text-sm text-text-secondary"
          >
            {helper}
          </Text>
        ) : null}
        <Picker
          title={label}
          kind="list"
          note={
            listNote ? <PickerNote id={noteId}>{listNote}</PickerNote> : null
          }
        >
          {message ?? (
            <>
              <ListBox
                ref={listRef}
                aria-describedby={listNote ? noteId : undefined}
                className={cx("lb", listStyle)}
              >
                {options.map((o) => (
                  <ListBoxItem
                    key={keyOf(o.value)}
                    id={keyOf(o.value)}
                    textValue={o.textValue ?? o.label}
                    isDisabled={Boolean(o.disabledReason) || o.struck}
                    data-value={o.value}
                    dir="auto"
                    className={cx(
                      "opt",
                      o.hour && "is-hour",
                      o.struck && "is-struck",
                      numeric && "num",
                    )}
                  >
                    <span className="opt-text">
                      <span className="opt-label">{o.label}</span>
                      {o.description && <small>{o.description}</small>}
                      {o.disabledReason && <small>{o.disabledReason}</small>}
                    </span>
                    <Icon name="check" className="opt-tick" />
                  </ListBoxItem>
                ))}
              </ListBox>
              <OpenAt
                listRef={listRef}
                target={current !== "" || hasEmptyOption ? current : openAt}
              />
            </>
          )}
        </Picker>
      </AriaSelect>
    </I18nProvider>
  );
}
