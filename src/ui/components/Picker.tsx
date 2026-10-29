// design.md 8.27: where the open list or calendar of a themed control shows. From 640 px wide a popover under
// the control; below, the bottom sheet of the dialogs (8.14), titled with the field's label, with a Close button.
// React Aria moves focus into the popup, keeps it there, closes it on Esc or a tap outside, and puts focus back
// on the control.
import type { ReactNode } from "react";
import { useContext } from "react";
import {
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  OverlayTriggerStateContext,
  Popover,
} from "react-aria-components";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { query, useMediaQuery } from "./hooks";

/** The one line at the top of a list (or under a sheet's title) that says why some choices are off. */
export function PickerNote({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="ctl-note">
      <Icon name="info" className="mt-1" />
      <span>{children}</span>
    </div>
  );
}

function SheetClose() {
  const state = useContext(OverlayTriggerStateContext);
  return (
    <Button
      variant="quiet"
      size="icon"
      icon="x"
      aria-label="Close"
      onClick={() => state?.close()}
    />
  );
}

/**
 * The popup of a Select, TimeField or DatePicker. `kind` decides its width: a list is as wide as the control, a
 * calendar is `size-calendar`. `dialog` wraps the content in a dialog (a calendar); a list is its own listbox.
 */
export function Picker({
  title,
  kind,
  note,
  dialogLabel,
  children,
}: {
  /** The field's label: the sheet's title. */
  title: string;
  kind: "list" | "calendar";
  note?: ReactNode;
  /** The calendar popover is a dialog named by the field (design.md 8.27, names). */
  dialogLabel?: string;
  children: ReactNode;
}) {
  const wide = useMediaQuery(query.sm);
  if (wide) {
    return (
      <Popover
        offset={4}
        containerPadding={8}
        placement="bottom start"
        className={cx("ctl-pop", kind === "list" ? "is-list" : "is-calendar")}
      >
        {kind === "calendar" ? (
          <Dialog aria-label={dialogLabel ?? title} className="outline-none">
            {children}
          </Dialog>
        ) : (
          <>
            {note}
            {children}
          </>
        )}
      </Popover>
    );
  }
  return (
    <>
      {kind === "list" && (
        // A Select finds its options by rendering its children once out of sight; a closed Popover still
        // hands them over there, a Modal does not. This one never opens.
        <Popover isOpen={false}>{children}</Popover>
      )}
      <ModalOverlay isDismissable className="ctl-scrim">
        <Modal
          className={cx("ctl-sheet", kind === "calendar" && "is-calendar")}
        >
          <Dialog
            aria-label={kind === "calendar" ? (dialogLabel ?? title) : title}
            className="ctl-sheet-dialog"
          >
            <div className="ctl-sheet-head">
              <Heading slot="title" className="text-xl">
                {title}
              </Heading>
              <SheetClose />
            </div>
            {note}
            <div className="ctl-sheet-body">{children}</div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
