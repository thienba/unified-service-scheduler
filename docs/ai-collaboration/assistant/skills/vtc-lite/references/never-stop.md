# Never stop

No role and no step waits for the human. When the request, `context/` or the code does not
answer something:

1. Write `context/<NNNN-area>/Q-NNNN-n.md` (product-wide: `context/questions/Q-0000-n.md`):

   ```markdown
   ---
   type: question
   raisedBy: <role>
   ticket: <ticket id or none>
   created: <ISO time>
   ---
   **Question:** <one sentence>

   - A. <option>
   - B. <option>
   - C. <option, optional>

   **Taken:** A, because <one sentence>.
   ```

2. Continue on the option taken. The ticket's `## Guesses` section and the PR list the question.

Before writing one, search the area's `Q-` and `D-` files: a question already answered by a `D-`
file is not a question; one already open is reused, not duplicated.

## When the human answers

When the human answers `Q-NNNN-n` (in any words, in any later session):

1. Write `D-NNNN-m.md` in the same folder: what was decided, `resolves: Q-NNNN-n`, the date.
2. Update the requirement or context file the answer changes.
3. Delete the `Q-` file and update the area's `index.md`.
4. If the answer differs from the option taken, write a ticket that changes the code to match.
5. Commit memory.

## When work cannot be done

Two criteria that contradict, code the ticket needs that does not exist and cannot be written in
this ticket, a check that cannot run on this machine: set the ticket to `error` with
`reason: "<cause>: <text>"`, record the question, and go on to the next ticket.
