# SonarQube Coding Standards

## Overview
All new code introduced into the `aura-ai` project must strictly adhere to our SonarQube Quality Gate requirements. 

## Rules
1. **Zero New Vulnerabilities**: No new security vulnerabilities are permitted.
2. **Zero New Bugs**: All new bugs identified by SonarQube must be resolved before merging.
3. **No New Code Smells**: Maintainability must remain an "A" rating. Avoid introducing cognitive complexity issues, duplicated code blocks, or unused variables.
4. **Code Coverage**: All new backend code (Go) MUST maintain a minimum test coverage. Any code added to services, handlers, repositories, or engine nodes requires accompanying unit tests using `go test`.
   - Ensure you run `go test ./... -cover` and inspect coverage before pushing.
5. **Accessibility standards**: For frontend code (React/TypeScript), ensure no new accessibility violations (like WCAG contrast/ARIA roles) or JSX syntax errors are introduced.

Before requesting a review, verify locally that the code fulfills these baseline quality standards.
