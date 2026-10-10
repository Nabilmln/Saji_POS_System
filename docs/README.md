# Restaurant POS — OpenDesign Context Bundle

Use this bundle as the project knowledge base for designing the Restaurant POS & QR Self-Ordering web application.

## Files

- `docs/DESIGN.md`: machine-readable working visual design system and UI guardrails.
- `docs/01-prd-restaurant-pos.md`: product requirements.
- `docs/02-business-rules.md`: approved business rules and remaining decisions.
- `docs/03-user-flows.md`: customer, cashier, and admin journeys.
- `docs/04-system-architecture.md`: Next.js + NeonDB modular-monolith architecture.
- `docs/05-database-design.md` and `docs/05-schema-reference.sql`: ERD/data design references.
- `docs/06-api-specification.md`: API routes, roles, request/response contracts.
- `docs/07-ui-ux-guidelines.md`: screens, interactive states, accessibility, responsive design and OpenDesign prompts.
- `docs/08-development-roadmap.md`: milestone plan and open decision gates.

## First prompt (copy into OpenDesign)

Read `docs/DESIGN.md` and `docs/07-ui-ux-guidelines.md`, then consult `docs/01-prd-restaurant-pos.md` through `docs/06-api-specification.md` for constraints. Design two coherent screen directions first: **C02 Customer Menu** at 390px and **K01 Cashier POS Overview** at 1440px. Use realistic Indonesian copy and IDR currency. Present shared components and a consistent token system. Do not add split bill, QRIS, customer PIN/login/self-cancellation, stock, recipe, print receipt, or extra order/table statuses. Before expanding, show a checklist of adherence to the spec and identify visual decisions requiring approval.

## Important

Visual tokens are proposals, not a finalized brand. The opening of the first table session by customer checkout remains a proposed policy (see OD-01 in doc 07); do not mark it as product-approved.
