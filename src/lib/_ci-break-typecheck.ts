// SCRATCH file: proves the Typecheck CI step can fail. Not imported by any
// page or route, so it cannot affect `next build`'s bundle -- only
// `tsc --noEmit`, which type-checks every file under tsconfig's `include`
// regardless of the import graph, sees this. Deleted in the next commit.
export const CI_BREAK_TYPECHECK: number = "this is not a number";
