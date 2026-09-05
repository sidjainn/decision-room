# Ansel landing page design specification

Status: design handoff only. This document does not authorize implementation.

## 1. Product position

Ansel is a **live decision system** for Chiefs of Staff and cross-functional leaders. It gives a group one shared, evolving view of the decision while they are making it: the objective, constraints, options, evidence, disagreements, proposal, and confirmed outcome.

Ansel is not:

- a PM backlog or universal prioritisation database;
- an AI meeting note-taker that summarizes everything said;
- an autonomous decider that hides judgment behind a recommendation.

Core promise: **the room leaves with a decision people can explain and execute, not another set of notes.**

Primary audience: Chiefs of Staff, Heads of Operations and BizOps leaders at 30–300-person technology and service companies. Secondary audience: functional leaders who participate in or own the resulting work.

## 2. Information architecture

Single-page structure:

1. Navigation: Ansel; How it works; Use cases; Trust; **Request a pilot**.
2. Hero: position, primary CTA, and a live weekly trade-off room.
3. Problem: meetings and tools retain activity but lose the decision state.
4. Product mechanism: frame, compare, resolve, commit.
5. Weekly trade-off walkthrough: the primary proof story.
6. Decision receipt: what remains after the room ends.
7. Secondary use cases: hiring and client scope.
8. Trust and human control.
9. Competitive distinction.
10. Final CTA and minimal footer.

Do not add a feature-card grid, testimonial carousel, pricing, or an integrations wall until real content exists for them.

## 3. Hero

### Copy

Descriptor beside the wordmark: **Live decision system**

Headline:

> **Five leaders. Three urgent requests. One available team.**

Lead: **Turn the weekly trade-off room into a decision.**

Supporting copy:

> Ansel gives Chiefs of Staff and cross-functional leaders a shared, live system for comparing options, surfacing disagreement, and locking an executable decision while the room is still together.

Primary CTA: **Request a pilot**  
Secondary CTA: **Watch a decision unfold**

CTA support: **Bring one real decision. We’ll set up the first room with you.**

### Hero product story

Show a credible live room, not a generic dashboard or chat transcript.

- Decision: “What gets the one available launch team this week?”
- Objective: protect customer commitments without creating avoidable rework.
- Constraint: 6 team-days available.
- Options: enterprise SSO unblock; billing retry fix; partner launch.
- Criteria: revenue at risk; customer impact; reversibility; effort.
- Visible tension: Sales and Product differ on the partner launch.
- Confirmed outcome: billing retry fix now; SSO reduced to an auth spike; partner launch moves to 17 September.
- Commitment: named owners, next checkpoint, and the assumption that would trigger a revisit.

The room should visibly change from open options to a confirmed decision. Do not lead with audio waves, a bot avatar, or a transcript; those imply note-taking.

## 4. Value proposition and narrative sequence

### The missing layer

Headline: **Work is tracked. Decisions are not.**

Slides hold context, chat holds reactions, meetings create momentum, and project tools hold tasks. None maintains a shared answer to “what are we deciding, where do we differ, and what now counts as decided?”

### How Ansel works

Use one connected decision trace rather than four interchangeable cards:

1. **Frame the decision** — agree on the question, objective, constraints, criteria, and rule for deciding.
2. **Make the trade-off visible** — place options, evidence, dependencies, and participant positions in one live view.
3. **Resolve the real difference** — Ansel points to the disagreement that can change the outcome; people correct its interpretation.
4. **Commit the result** — confirm the chosen scope, owners, timing, rationale, assumptions, and revisit trigger.

### Weekly trade-off walkthrough

Make this the page’s longest and most concrete section. A pinned room state may advance through three user-controlled steps:

- **Monday, 10:04 — competing asks:** three urgent requests exceed one team’s capacity.
- **Monday, 10:17 — decisive tension:** the partner commitment is commercially important, but its dependency is not ready.
- **Monday, 10:31 — confirmed:** scope is split, one request moves, owners accept the decision, and the revisit condition is recorded.

Use sentence-level annotations to explain what changed and why. Avoid fake productivity statistics.

### What survives the meeting

Show the final **decision receipt** as a compact, shareable object:

- decision and effective date;
- included, reduced, and deferred scope;
- rationale and supporting evidence;
- owner per commitment;
- assumptions, dependencies, and revisit trigger;
- who confirmed it and when.

Copy: **Not minutes. The current truth of the decision.**

## 5. Example use cases

Keep the weekly trade-off room dominant. Present the other two as concise proof that the same decision structure travels across functions, not as a template marketplace.

### Weekly cross-functional trade-off — primary

“Which requests get the constrained team this week?” Ansel holds the shared objective and capacity, exposes where functions value options differently, and records the executable allocation.

### Hiring — secondary

“Do we open the senior solutions role now or wait one quarter?” Compare coverage risk, pipeline evidence, ramp time, and runway; record the hire/no-hire decision and the condition that would reopen it.

### Client scope — secondary

“What belongs in phase one?” Separate contractual commitments from desirable additions, make delivery trade-offs explicit, and confirm scope, owner, timing, and change conditions with the account team.

## 6. Calls to action

- Primary site-wide action: **Request a pilot**.
- Hero secondary action: **Watch a decision unfold**; scrolls to and activates the walkthrough.
- Mid-page action after the decision receipt: **Bring your next trade-off**.
- Final headline: **Make the next hard meeting count.**
- Final body: **Start with one live decision and the people who need to own it.**
- Final button: **Request a pilot**.

Do not mix “Book a demo,” “Get started,” “Join waitlist,” and “Create room.” One action vocabulary should persist through the page.

## 7. Visual direction

Concept: **the decision ledger** — calm, operational, and inspectable. The memorable device is a continuous decision trace running from competing inputs to a confirmed decision receipt. Lines, brackets, and state changes must encode relationships; decoration should not imitate a generic AI glow.

### Tokens

| Token | Value | Use |
|---|---:|---|
| Ledger ink | `#17213A` | primary text and confirmed state |
| Work surface | `#F7F8FA` | page background |
| Paper | `#FFFFFF` | room and decision record |
| Cobalt | `#3659D9` | active controls and selected evidence |
| Signal amber | `#B66A12` | unresolved difference or dependency |
| Confirmed teal | `#16705A` | human-confirmed agreement only |

No decorative gradients. Never rely on amber/teal alone; pair state color with text and a distinct icon or line style.

Typography: **IBM Plex Sans Condensed** for large headlines and decision statements; **IBM Plex Sans** for body and interface text. The condensed face should feel like an operating brief, not a campaign poster. Use sentence case, tight headline leading, and body lines below 75 characters. Avoid all-caps eyebrows and decorative monospace labels.

Layout: left-aligned 12-column grid; 5 columns for argument and 7 for the live room in the hero. Use open page regions separated by functional rules, not a wall of rounded cards. Reserve radius for controls (6–8 px); the decision receipt may use a firmer rectangular edge.

```text
Desktop hero
┌──────────────────────────────────────────────────────────────┐
│ Ansel · Live decision system        How it works  Trust  CTA │
├────────────────────────┬─────────────────────────────────────┤
│ Five leaders. Three    │ Decision question + constraint      │
│ urgent requests. One   │ ─ option / position / evidence ─── │
│ available team.        │ ─ option / unresolved tension ──── │
│                        │ ─ option / position / evidence ─── │
│ [Request a pilot]      │                  Confirmed decision │
│ Watch a decision unfold│                  Owner · revisit    │
└────────────────────────┴─────────────────────────────────────┘
```

Imagery: product UI and decision artifacts only. If people appear, show a real working session with the room state visible; avoid stock boardroom photography, abstract 3D shapes, robot motifs, and chat bubbles.

## 8. Interaction and motion

- On first load, run one 5–7 second hero sequence: positions appear, the decisive tension is marked, and the confirmed decision locks into place. Stop on the completed state.
- “Watch a decision unfold” replays or focuses the same sequence with step controls and explanatory text.
- In the walkthrough, selecting an option reveals its linked criteria, evidence, and participant positions; the relationship is spatial and reversible.
- Confirmation motion should feel consequential: the proposal boundary closes, participant confirmations appear, then owners and revisit trigger resolve. Avoid confetti.
- Do not animate every section on scroll. User-triggered state changes may use 160–240 ms transitions.
- With reduced motion, show the complete state immediately and retain all step content as static text.

## 9. Trust language

Primary trust statement: **Your team decides. Ansel makes the decision legible.**

Supporting points:

- **Visible interpretation:** people can see and correct what Ansel believes is agreed, disputed, or unsupported.
- **Explicit confirmation:** suggestions remain suggestions until authorized participants confirm them.
- **Traceable rationale:** the result stays connected to the criteria, evidence, and trade-offs that shaped it.
- **Bounded role:** Ansel facilitates and records the decision; it does not replace accountable judgment.

Do not claim encryption, regulatory certification, retention guarantees, model-training exclusions, or enterprise controls until those claims are verified. Privacy language should link to a real policy rather than use “secure by default” as filler.

## 10. Competitive differentiation

| Category | What it retains | What Ansel adds |
|---|---|---|
| Meeting note-taker | transcript, summary, action items | live decision state, disagreement, confirmation, and rationale |
| Project/backlog tool | items, ranks, assignments, status | the bounded cross-functional trade-off that determines what should enter execution |
| Chat and documents | context and discussion | one current, structured answer that changes with the room |
| Polling or voting | preference count | criteria, evidence, dependencies, minority concerns, and an executable commitment |

Differentiation line: **Most tools document the meeting or manage the work. Ansel maintains the decision between them.**

## 11. Responsive behavior

- Desktop (`>= 1200 px`): split hero with the live room visible above the fold at 1280 × 800; walkthrough uses a pinned room and adjacent narrative.
- Tablet (`768–1199 px`): stack copy over the room; keep the full decision trace, shorten labels, and move details into explicit expanders.
- Mobile (`320–767 px`): use a three-step decision sequence rather than shrinking the full room. Keep the question, constraint, one decisive tension, outcome, owner, and revisit trigger visible in order.
- Navigation collapses to wordmark plus **Request a pilot**; section links move into an accessible menu.
- Never use horizontal page scrolling. Tables become labelled comparison blocks; the competitive meaning must remain intact.

## 12. Accessibility

- Meet WCAG 2.2 AA contrast and interaction requirements.
- Provide visible keyboard focus, logical heading order, a skip link, and 44 × 44 px minimum pointer targets.
- Every animated state change must have an equivalent text update; announce user-triggered changes through a polite live region.
- Do not encode positions, disagreement, or confirmation by color alone.
- Step controls must be keyboard operable and expose current step, total steps, and pause/replay state.
- Product mockups need meaningful names and descriptions; decorative trace lines are hidden from assistive technology.
- Support 200% zoom, text reflow, reduced motion, and high-contrast/forced-colors modes.

## 13. Acceptance criteria

The design is ready for implementation when:

- a first-time visitor can identify Ansel as a live decision system, name its audience, and explain the weekly trade-off use case after five seconds;
- the hero uses the approved headline, audience-specific supporting copy, one CTA vocabulary, and the concrete weekly trade-off room;
- the page shows criteria, options, disagreement, evidence, human confirmation, owners, and a revisit trigger—not a transcript-first experience;
- the weekly trade-off is the dominant story; hiring and client scope are clearly secondary;
- no section positions Ansel as a backlog, task manager, generic meeting assistant, or autonomous decision-maker;
- the final decision receipt is visibly distinct from a meeting summary and is traceable to the room state;
- trust claims describe visible product behavior and contain no unsupported security or compliance promises;
- the page has a designed state at 320, 768, 1280, and 1440 px with no loss of narrative or action;
- all interactive states have keyboard, reduced-motion, and non-color equivalents and meet WCAG 2.2 AA;
- the hero sequence stops, can be replayed, and never blocks access to its static content;
- no placeholder metrics, fabricated customer logos, fake testimonials, or unverifiable claims appear.
