# Test assignment: event registration

The text of the assignment: the general requirements, the expected result and the task.

# Requirements

The same for all tasks.

1. **A client-server product:** a separate backend and a separate frontend that talk over the
   network.
2. **Backend:** Python, Go or Node.js. These are the preferred options, but not required ones. If
   there were good reasons for the choice of the language, libraries and tools, describe them.
3. **Frontend:** Vue or React.
4. **Storage:** a relational DBMS. PostgreSQL, MySQL or any equivalent of your choice, preferably
   PostgreSQL.
5. **Accounts and login** — at your discretion, including the login model. You may limit it to a
   login and a password, or do without login.
6. **Prompts or a decision log are handed in together with the code:** why the project is built
   this way and not another, why these packages and approaches were chosen. What exactly and in
   what form — in the section "What we expect from you".
7. **The use of AI agents is expected.** We assume the project is made together with an agent, and
   that is why we ask for the prompts. There is no need to hide it.
8. **The prerequisites** for deploying the project are described.
9. **Local run.** The project is quick to deploy locally.
10. **External services may be emulated.** Email, third-party APIs and the like may be replaced
    with stubs.
11. **Works with two clients open at the same time** (for example, two browser tabs).
12. **An honest description of the project's state:** what works, what does not, what was not done
    and why.
13. **Provability.** The project must prove that it works.

---

# What we expect from you

At the end of the work we expect from you:

1. A link to the project's repository on GitHub.
2. What it was built with: which model, which tool. And why those, in a couple of sentences.
3. Prompts, a decision log or an export of the agent session. An export is the file your tool
   produces (`.jsonl` or similar), we will handle it with care. If you would rather not hand over
   the export, a decision log or a development journal will do.
4. The course of work over time. It matters to us to see that the work went step by step rather
   than being handed in all at once: by the commit history, the session log or the decision log.
   Record timestamps from the start of the work to the end and along the way. Ask the agent to do
   it.
5. A description of the project: how to deploy it and what state it is in.
6. What you would do in the next round: what did not make it into the scope, but you consider
   necessary.
7. If you based the work on someone else's solution, a template or a generator — say so.

---

## Task 9. Event registration

The product is an event registration service: the organizer creates an event with a limited number
of seats, participants register, and they are checked in at the entrance.

### Must include:

- **An event:** description, date and time, seat limit.
- **A participant registers by email**, cancelling participation.
- **A waitlist** when the seats run out.
- **A ticket with a code** and a check-in screen at the entrance. The scanner may be replaced with
  code input.
- **The organizer's screen:** how many registered, on the waitlist, arrived.

### Expected behavior:

- A registered participant gets an email with the ticket. Registering again with the same email
  does not create a second seat.
- When the seats have run out, new registrations go onto the waitlist. Someone cancelled — the first
  one on the waitlist automatically gets the seat and an email.
- Two people for the last seat at once: the seat goes to one, the other goes onto the waitlist.
- A day before the event all participants get a reminder. Exactly one.
- A ticket passes check-in once. The organizer's arrived counter updates live.
- The organizer rescheduled the event — all participants get an email.

---
