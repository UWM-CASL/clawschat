# GUIDANCE.md

## Purpose

This guidance defines how Codex and other coding agents should create, modify, document, and maintain software so that human developers — including entry-level developers — can understand, review, operate, and safely change the codebase.

The goal is not merely to produce working software. The goal is to produce **human-manageable software**.

A codebase is not complete until a human can understand:

* what it does
* why it is shaped this way
* how it is organized
* how to run it
* how to change it
* how it fails
* what assumptions it depends on

## Core Principle

Do not only produce code. Produce familiarity.

Agent-generated software must include the human-facing knowledge needed to understand, operate, review, and safely modify it.

Working code without explanation creates maintenance debt. Generated code without a story becomes an alien artifact: it may run, but humans cannot easily inhabit it.

When an agent creates or substantially modifies code, it should also create or update the documentation and design notes that make the codebase legible.

## Agent Responsibilities

When creating or modifying software, the agent must:

* write readable, maintainable code
* explain important structural choices
* document assumptions
* update relevant project documentation
* preserve or improve existing conventions
* avoid unnecessary complexity
* make future maintenance easier
* identify risks and unresolved issues
* ensure the code and documentation tell the same story

For non-trivial changes, the agent should leave behind enough context that another developer can continue the work without archaeology.

## Required Knowledge Artifacts

For a substantial project, the agent should maintain the following files when relevant:

* `README.md`
* `ARCHITECTURE.md`
* `CONVENTIONS.md`
* `MANUAL.md` or `OPERATIONS.md`
* `FAQ.md`
* `FAILURE_MODEL.md`
* `CHANGELOG.md`

For smaller projects, these may be combined into:

* `README.md`
* `MAINTAINERS.md`

The exact filenames matter less than the presence of the knowledge. The project should have:

* a map
* a story
* a rulebook
* an operating manual
* a failure model
* a change guide

## README Standard

The README is the project’s front door.

It should explain:

* what the project is
* who it is for
* what problem it solves
* how to install dependencies
* how to run it locally
* how to run tests
* how to configure it
* what environment variables are required
* where the main code lives
* where to read more detailed documentation

The README should not try to hold every detail. It should orient the reader and point them to the right place.

## Architecture Story Requirement

Every non-trivial codebase should have an architecture story.

This should not merely list folders. It should explain the shape of the system in plain language.

The architecture story should describe:

* the purpose of the system
* the major components
* how data flows through the system
* where external dependencies enter
* where state is stored
* where configuration lives
* where risk is concentrated
* which parts are expected to change
* which parts are intentionally boring or stable
* what was intentionally not built

The architecture story should make the system feel familiar to a human maintainer.

## Design Philosophy Requirement

Every non-trivial codebase should include a written design philosophy.

The design philosophy explains the project’s default choices when more than one reasonable approach exists.

It should answer questions such as:

* Does the project favor explicit code or framework magic?
* Does the project prefer duplication or abstraction?
* Where does validation belong?
* Where does business logic belong?
* How are external services isolated?
* How are errors handled?
* How is configuration managed?
* How are tests organized?
* What does the project intentionally avoid?

Example:

```md
## Design Philosophy

This project favors explicit code over framework magic.

Business logic should remain separate from UI code.

External API responses are treated as untrusted and normalized before entering application state.

Readable duplication is preferred over premature abstraction.

Shared utilities should be pure functions unless there is a documented reason otherwise.
```

## Conventions Requirement

The agent should maintain clear project conventions.

These conventions should explain:

* how files are named
* how functions are named
* how classes are named
* where validation happens
* where errors are handled
* how logging works
* how tests are structured
* how UI components are organized
* how API clients are written
* what belongs in shared utilities
* what should not go in shared utilities

Example:

```md
## Project Conventions

- Files that call external services end in `Client`.
- Files that enforce business rules end in `Service`.
- UI components should not call APIs directly.
- API responses are normalized before entering application state.
- All user-facing errors are mapped through the error message layer.
- Shared utilities must not depend on application state unless documented.
```

Conventions help future contributors make changes that feel native to the project.

## Manual or Operations Guide Requirement

The project should include instructions for operating the software.

The manual should explain:

* how to install dependencies
* how to run the project locally
* how to configure the project
* how to run tests
* how to inspect logs
* how to troubleshoot common problems
* how to reset local state
* how to deploy or package the project, if applicable
* where credentials or secrets are expected to live
* what not to touch casually

The manual should be written for a human who has never operated the project before.

## Maintainer FAQ Requirement

The agent should create and maintain a FAQ for future developers.

The FAQ should answer real questions a maintainer is likely to ask, such as:

* Why is the project organized this way?
* Where do I add a new feature?
* Where do I add a new integration?
* Why is this duplicated instead of abstracted?
* Why does this abstraction exist?
* What should I avoid changing casually?
* What assumptions does the system make?
* What are the most common failure points?
* How do I debug common problems?
* Where should tests be added?

A FAQ is allowed to be conversational. Its job is to reduce the time it takes for a human to become comfortable in the codebase.

## Failure Model Requirement

Every meaningful system should document how it can fail.

The failure model should identify:

* untrusted inputs
* external services that may fail
* data that may be missing, stale, malformed, or contradictory
* actions that are irreversible
* places where the system should fail closed
* privacy-sensitive boundaries
* security-sensitive boundaries
* recovery steps for common failures
* risks that remain unresolved

Example:

```md
## Failure Model

This app assumes external providers may return incomplete, stale, or contradictory data.

The app should not crash because of a missing icon, missing temperature, malformed alert, or unavailable provider.

Configuration files are treated as untrusted input.

The display view should fail closed: if no valid configuration exists, it should display nothing.
```

The failure model should be plain-language and practical. It does not need to become security theater.

## Assumptions Requirement

The agent must declare assumptions when generating or changing code.

Assumptions should be written plainly.

Example:

```md
## Assumptions

- The app has only one active configuration at a time.
- API responses may be incomplete and must be normalized before use.
- The display view should not expose editing controls.
- Local file storage is acceptable for development but not production.
```

Assumptions are review targets. A human should be able to say, “That assumption is wrong,” before it becomes fossilized into the code.

## Change Guide Requirement

The project should document common change paths.

A change guide explains how future developers should safely modify the system.

Example:

```md
## Common Changes

### Add a new data provider

1. Create a provider client.
2. Normalize provider-specific data into the internal model.
3. Register the provider.
4. Add tests using fixture responses.
5. Update the provider documentation.

### Add a new UI panel

1. Create the panel component.
2. Register it in the panel registry.
3. Keep data fetching outside the component unless the architecture says otherwise.
4. Add a fixture or example state.
5. Update the maintainer FAQ if the pattern is new.
```

The change guide should help entry-level developers follow established paths instead of guessing.

## Readability Standard

Code should be written for the next human maintainer, not only for the compiler, interpreter, or model.

Prefer:

* clear names
* small functions
* simple control flow
* explicit boundaries
* obvious data shapes
* predictable dependencies
* visible assumptions
* useful error handling
* tests that describe behavior

Avoid:

* cleverness without benefit
* hidden global state
* unexplained framework magic
* unbounded loops or retries
* large files with mixed responsibilities
* silent failures
* undocumented generated complexity

Readable code lowers the cost of understanding.

## Simplicity and Safety Standard

The agent should favor code that is easy to inspect, easy to bound, easy to test, and hard to surprise.

Useful principles:

* Keep control flow simple.
* Put limits on loops, retries, inputs, files, queues, and batch operations.
* Avoid hidden or unpredictable resource use.
* Keep functions short enough to review.
* Validate inputs and check errors.
* Keep variables close to where they are used.
* Treat warnings as problems, not decoration.
* Avoid magic behavior that readers cannot see.
* Use indirection only when it makes the design clearer.
* Make code easy for tools and humans to analyze.
* Test more rigorously where failure matters more.
* Match engineering discipline to risk.

Simple code is not beginner code. Simple code is survival code.

## Naming Standard

Names should reveal intent.

Use names that explain what something means in the domain, not merely what type of thing it is.

Prefer:

```ts
const activeUsers = users.filter(user => user.isActive);
const trialPeriodDays = 7;
const finalGrade = calculateFinalGrade(submission);
```

Avoid:

```ts
const arr2 = arr.filter(x => x.a);
const d = 7;
const result = process(data);
```

Abbreviations should be avoided unless they are universal in the project or domain.

## Function Standard

Functions should do one clear thing.

A function should usually have:

* a clear name
* a single responsibility
* predictable inputs
* predictable outputs
* limited side effects
* manageable length

If a function name needs “and,” the function may be doing too much.

Prefer:

```ts
validateSubmission();
calculateLatePenalty();
calculateFinalScore();
saveGrade();
notifyStudent();
```

Avoid:

```ts
validateAndGradeAndSaveAndNotify();
```

## Comment Standard

Comments should explain why, not merely what.

Good comments explain:

* business rules
* constraints
* surprising decisions
* external system behavior
* security concerns
* historical context
* non-obvious tradeoffs

Avoid comments that simply narrate obvious code.

Prefer:

```ts
// Canvas exports assignment scores as strings, so convert before averaging.
const score = Number(rawScore);
```

Avoid:

```ts
// Add one to count.
count = count + 1;
```

## Error Handling Standard

Failures should be visible, diagnosable, and safe.

The agent should not silently swallow errors unless there is a documented reason.

Error handling should:

* preserve useful debugging context
* avoid leaking secrets
* provide clear user-facing messages when appropriate
* distinguish expected failures from unexpected failures
* fail closed for security-sensitive or irreversible actions
* log enough information to diagnose the problem

Avoid:

```ts
try {
  await saveUser(user);
} catch (error) {}
```

Prefer:

```ts
try {
  await saveUser(user);
} catch (error) {
  logger.error("Failed to save user profile", { userId: user.id, error });
  throw new Error("Unable to save user profile");
}
```

## Configuration Standard

Important settings should not be buried deep in code.

Configuration should be:

* explicit
* documented
* validated
* separated from business logic
* safe by default

Environment variables, config files, and settings objects should be documented.

Example:

```env
DATABASE_URL=
API_BASE_URL=
LOG_LEVEL=
```

The documentation should explain what each setting does and whether it is required.

## Dependency Standard

Dependencies should be added deliberately.

Before adding a dependency, the agent should consider:

* What does this dependency do?
* Is it necessary?
* Is it maintained?
* Is it trustworthy?
* Can the standard library or existing project code do this well enough?
* What future maintenance burden does it add?

Do not add dependencies merely for convenience if the cost exceeds the benefit.

## Testing Standard

Tests should describe expected behavior.

Riskier code requires stronger tests.

Prioritize tests for:

* authentication
* authorization
* grade, payment, or scoring logic
* data deletion
* external integrations
* configuration parsing
* file operations
* security-sensitive behavior
* irreversible actions
* data normalization
* error handling

Good test names should explain the behavior being protected.

Example:

```ts
it("returns false when the assignment is submitted after the due date");
```

Tests are documentation with enforcement.

## Risk-Based Engineering Standard

Not all code requires the same ceremony.

The agent should match engineering discipline to consequence.

A rough risk ladder:

* Low risk: prototypes, demos, personal scripts
* Medium risk: internal tools, class projects, departmental workflows
* High risk: money, grades, identity, access control, legal records, production data
* Critical risk: safety, health, infrastructure, large irreversible consequences

Higher-risk code requires stronger validation, testing, documentation, logging, and review.

## Paradigm and Abstraction Restraint

The agent should not force a programming paradigm onto a problem.

Use procedural, functional, object-oriented, declarative, or event-driven styles where they make the code more maintainable, not because one style has been chosen as universally superior.

Prefer the simplest style that clearly represents the problem.

Use simple procedural code when:

* the task is a clear sequence of steps
* there is little or no persistent state
* the logic is script-like or workflow-like
* the code is easier to read as a direct process

Use functional style when:

* data is transformed through clear stages
* functions can be pure and easy to test
* mapping, filtering, reducing, parsing, or normalization is the main work
* avoiding mutation improves clarity

Use object-oriented style when:

* the system has entities with state and behavior that belong together
* there are multiple implementations behind a shared interface
* lifecycle matters
* dependency boundaries need to be explicit
* encapsulation reduces accidental coupling

Use declarative configuration when:

* humans need to describe what should happen more than how it happens
* behavior can be safely represented as data
* validation is strong
* the system should be extensible without changing core code

Use event-driven style when:

* actions happen asynchronously
* multiple parts of the system need to react to the same event
* producers and consumers should be loosely coupled
* the event flow is documented well enough to avoid mystery behavior

## Object-Oriented Design Standard

Use object-oriented design when it improves maintainability by grouping related state, behavior, lifecycle, or interchangeable implementations.

Do not use classes as decorative namespaces.

A class should usually represent one of the following:

* a meaningful domain concept
* a service with a clear responsibility
* a boundary around external state or dependencies
* an implementation of a shared interface
* an object with a lifecycle that must be managed

Avoid object-oriented design when the class:

* only contains unrelated helper methods
* has no meaningful state
* makes simple data transformations harder to follow
* exists only to make the code look more formal
* hides behavior that would be clearer as plain functions

Example of a class with a reason to exist:

```ts
class WeatherProviderClient {
  constructor(private readonly apiKey: string) {}

  async getForecast(location: Location): Promise<Forecast> {
    const response = await fetchForecastFromProvider(this.apiKey, location);
    return normalizeForecast(response);
  }
}
```

This class owns configuration, wraps an external dependency, and provides a stable boundary.

Example of unnecessary OOP:

```ts
class StringUtils {
  capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  slugify(value: string): string {
    return value.toLowerCase().replaceAll(" ", "-");
  }
}
```

Plain functions would likely be clearer:

```ts
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function slugify(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
}
```

## Paradigm Choice Explanation

When more than one programming style would reasonably work, the agent must explain why it chose one style over the other.

This applies especially when choosing between:

* procedural code and object-oriented code
* functional transformations and stateful services
* declarative configuration and imperative logic
* direct function calls and event-driven behavior
* simple modules and larger abstractions

The explanation should be brief and practical. It should focus on maintainability, readability, testability, and expected future change.

The agent should answer:

* What viable alternatives existed?
* Which approach was chosen?
* Why is this approach more maintainable here?
* What tradeoff does this choice accept?
* When should the choice be revisited?

Example:

```md
For this provider integration, a class-based client was chosen instead of standalone functions.

Both approaches would work. Standalone functions would be simpler for a single API call, but this provider requires shared configuration, authentication headers, retry behavior, and response normalization. A class keeps that provider-specific state and behavior behind one boundary.

The tradeoff is slightly more structure up front. This should be revisited if the class becomes a miscellaneous dumping ground or if the provider remains small enough that plain functions would be clearer.
```

Opposite example:

```md
For these date-formatting helpers, standalone functions were chosen instead of a utility class.

Both approaches would work, but the helpers do not share state, manage a lifecycle, or represent a domain object. A class would mostly act as a decorative namespace. Plain functions are easier to test, import, and read.

This should be revisited only if formatting becomes tied to shared locale configuration or a larger formatting service.
```

The model should not merely produce structure. It should justify structure.

## Abstraction Justification Requirement

Abstractions must earn their place.

When introducing a significant abstraction, the agent should briefly explain why it exists.

Significant abstractions include:

* new classes
* interfaces
* factories
* registries
* plugin systems
* dependency injection containers
* event buses
* custom hooks
* decorators
* middleware chains
* provider systems
* normalization layers

The explanation should answer:

* What maintenance problem does this abstraction solve?
* What future change does it make easier?
* What complexity does it add?
* Why is this better than a simpler function or module?
* When should this abstraction be removed or simplified?

Do not create abstraction for appearance.

Avoid paradigm theater: classes, factories, interfaces, inheritance trees, hooks, decorators, pipelines, or event buses should not be added merely to make the code appear more engineered.

## Indirection Standard

Use indirection only when it improves maintainability.

Indirection includes:

* callbacks
* event listeners
* dependency injection
* reflection
* dynamic imports
* plugin systems
* configuration-driven behavior
* registries
* middleware chains

Before adding indirection, the agent should ask:

* Will this make the code easier to change?
* Will this make testing easier?
* Will this hide behavior from the reader?
* Can a new developer trace what happens?
* Is a simpler direct call better?

A beginner should be able to answer: when this line runs, what code actually executes?

## Refactoring Requirement

After generating code, the agent should perform a maintainability pass.

The agent should check for:

* overlong functions
* unclear names
* repeated logic
* mixed responsibilities
* missing tests
* hidden assumptions
* undocumented conventions
* fragile error handling
* unnecessary abstraction
* inconsistent style
* missing documentation updates

The agent should refactor until the code and documentation tell the same story.

## Documentation Synchronization Requirement

When code changes, documentation should change with it.

The agent should update relevant documentation when it changes:

* commands
* configuration
* dependencies
* file organization
* architecture
* data flow
* external integrations
* error handling
* deployment steps
* testing strategy
* assumptions
* common change paths

Outdated documentation is dangerous because it creates false familiarity.

## Human Review Standard

Before completing a coding task, the agent should be able to answer:

* What changed?
* Why was it changed this way?
* What assumptions were made?
* What files are most important to review?
* What risks remain?
* What documentation was updated?
* How would a new developer continue from here?
* Were multiple design approaches viable?
* Why was this approach chosen?

For substantial changes, the agent should include a concise review note for the human.

## Completion Standard

A coding task is not complete merely because the software runs.

A coding task is complete when:

* the code works
* the code is readable
* the code has clear boundaries
* the project knowledge artifacts are updated
* assumptions are documented
* common changes are explainable
* likely failures are described
* abstractions are justified
* paradigm choices are explained when non-obvious
* a human maintainer can pick up the work without archaeology

## Final Rule

Agents must not externalize complexity onto future human maintainers.

Generate code. Generate familiarity. Refactor until the code and the story agree.
