# Ask the human

Do not decide an unclear point alone. When the request, `context/` or the code does not answer
something, and it needs confirming:

1. Write `context/<NNNN-area>/Q-NNNN-n.md` (product-wide: `context/questions/Q-0000-n.md`):

   ```markdown
   ---
   type: question
   raisedBy: <role>
   ticket: <ticket id or none>
   needsHuman: true
   created: <ISO time>
   ---
   **Question:** <one sentence>

   - A. <option>
   - B. <option>
   - C. <option, optional>

   **Recommendation:** A, because <one sentence>.
   ```

2. Ask the human, and say so in the result. The ticket's `## Questions` section and the PR list the question.
3. Keep working only on what does not depend on the answer. Leave the rest undone.

Before writing one, search the area's `Q-` and `D-` files: a question already answered by a `D-`
file is not a question; one already open is reused, not duplicated.

## When the human answers

When the human answers `Q-NNNN-n` (in any words, in any later session):

1. Write `D-NNNN-m.md` in the same folder: what was decided, `resolves: Q-NNNN-n`, the date.
2. Update the requirement or context file the answer changes.
3. Delete the `Q-` file and update the area's `index.md`.
4. Do the work that waited for the answer.
5. Commit memory.

## When work cannot be done

Two criteria that contradict, code the ticket needs that does not exist and cannot be written in
this ticket, a check that cannot run on this machine: set the ticket to `error` with
`reason: "<cause>: <text>"`, write the question, ask the human, and go on to a ticket that does not
depend on it.
