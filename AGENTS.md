# Elite Rummy Circle - Project Rules

This document outlines the strict project rules, architecture patterns, and conventions that all developers and agents must adhere to when modifying this codebase.

## Mandatory Deployment Infrastructure

The Firebase Hosting configuration and GitHub Action workflows are critical production infrastructure and must never be removed, renamed, replaced, or modified unless explicitly requested by the user.

Keep the following files intact in all commits:
*   `firebase.json`
*   `.firebaserc`
*   `.github/workflows/firebase-deploy.yml`

Before deleting or altering any deployment-related file, always ask the user for explicit confirmation.
