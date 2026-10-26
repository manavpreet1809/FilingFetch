# FilingFetch

Automated public-filing retrieval and email delivery. Built by Manavpreet Singh.

Email the agent with a request such as:

> Please send the Other Documents for M12205.

The agent replies in the same thread with matter information, counts for all five document categories, and a ZIP containing up to ten valid files. Missing or invalid fields receive a clarification explaining what needs to be supplied.

## Deployment naming

Cloud setup and deployment scripts use the `filingfetch` resource prefix. Existing deployments using the previous prefix are not migrated automatically; configure the new resources before deploying.
