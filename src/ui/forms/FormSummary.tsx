// design.md 8.6: the summary Alert above a form lists every problem as a link to its field.
import { Alert } from "../components/Alert";
import { focusField } from "../components/Fields";

export interface FormProblem {
  /** The field's name, as given to `register`. */
  name: string;
  message: string;
  /** False for a problem the form has no field for: it is listed as text. */
  link?: boolean;
}

export function FormSummary({
  problems,
  action = "book this",
}: {
  problems: readonly FormProblem[];
  /** Finishes "before we can …". */
  action?: string;
}) {
  if (problems.length === 0) return null;
  const count = problems.length;
  return (
    <Alert
      kind="danger"
      title={`${count === 1 ? "1 thing needs" : `${count} things need`} fixing before we can ${action}.`}
    >
      <ul className="m-0 list-disc ps-5">
        {problems.map((p) => (
          <li key={p.name}>
            {p.link === false ? (
              p.message
            ) : (
              <a
                href={`#field-${p.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  focusField(`field-${p.name}`);
                }}
              >
                {p.message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
