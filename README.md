# CreatorDesk

An open-source, self-hosted "commission engine" for independent digital artists.
The product is a **client approval page**: the artist uploads a revision, sends a
private link, and the client clicks **Approve** or **Request changes**. Revision
history is retained so scope-creep conversations have an audit trail.

Not a marketplace. Not a portfolio host. Not a CRM.

## Run locally

```sh
npm install
cp .env.example .env
npm run migrate
npm run dev
# open http://localhost:3000
