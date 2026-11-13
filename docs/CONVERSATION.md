# Conversation record

The session that built this repository, 2026-11-13, between John Griffiths and an AI coding assistant
(Claude Code, cloud session). The owner's messages are reproduced as written. The assistant's side is
summarised: what it did, what it reported, and the commit that resulted. This is a curated record, not a
raw transcript; tool output and intermediate reasoning are left out.

For the current state and open items, read [HANDOFF.md](HANDOFF.md).

---

## 1. The starting plan

**Owner:**

> Here's a partial plan discussed with Gemini:
>
> This is a compelling direction—moving an enthusiast community from "cool weekend demos" (e.g., blinking an LED with an alpha wave) toward high-leverage infrastructure and translational tooling. The "knowledge graph as a project generator" concept is particularly strong because the graph itself is the first open-source project, and it naturally exposes structural gaps (the "really wants" edges) where community labor has outsized value.
>
> **1. Designing the Knowledge Graph Schema**
>
> To prevent the graph from becoming an unmaintained wiki, keep the ontology tight, directional, and action-oriented.
>
> - Nodes (Entities):
>   - Actors: Companies (startups, incumbents), Academic Labs, Open-Source Maintainers, Clinical/Regulatory Bodies.
>   - Tech / Artifacts: Hardware (headsets, chips, probes), Software (SDKs, signal processing libraries, firmware), Datasets, Standards/Formats.
>   - Problems / Capabilities: Specific bottlenecks or desired functions (e.g., dry-electrode artifact rejection, standardized BIDS export for consumer EEG, low-latency LSL drivers).
> - Edges (Relationships):
>   - PRODUCES / MAINTAINS (Actor → Tech)
>   - DEPENDS_ON / INTEGRATES_WITH (Tech → Tech)
>   - SOLVES / ADDRESSES (Tech → Problem)
>   - REALLY_WANTS (Actor or Tech → Problem or Not-Yet-Existing Tech) — This is your primary project-generation edge.
>   - BLOCKS (Problem → Capability)
>
> How to populate it without burnout:
>
> - Seed via LLM + Structured Extraction: Scrape/ingest public data (NeuroTechX hackathons, GitHub repos, company product pages, open-source neurotech directories) and use an LLM pipeline to propose (Node)-[Edge]->(Node) triples in JSON/YAML.
> - Git-based Curation: Store the graph as flat YAML/JSON files in a GitHub repo (compiled into Neo4j, NetworkX, or a static interactive web graph via CI/CD). Enthusiasts can submit Pull Requests to add their company, link a missing driver, or upvote a REALLY_WANTS edge.
>
> **2. High-Leverage Project Archetypes (Where Volunteers Beat Labs & Startups)**
>
> Academic labs are incentivized to publish novel papers (not maintain infrastructure), and startups are incentivized to build proprietary moats (not open standards). Your community thrives in the pre-competitive glue between them:
>
> | Archetype | Why Labs/Startups Won't Do It | Concrete Community Project Examples |
> |---|---|---|
> | The "Glue" & Interoperability | Low academic novelty; low direct revenue for startups. | Standardized Lab Streaming Layer (LSL) bridges, BIDS converters for consumer/prosumer hardware (Muse, OpenBCI, Emotiv, etc.), unified Python wrappers. |
> | Benchmarks & Validation | Startups avoid unfavorable comparisons; labs lack the breadth of devices. | Standardized open benchmark suites comparing signal quality, latency, and artifact resilience across hardware using open datasets. |
> | Data Curation & Harmonization | Tedious data engineering work that grad students avoid. | Cleaning, standardizing, and re-hosting fragmented public EEG/fNIRS/EMG datasets into cloud-ready, ML-friendly formats (e.g., HuggingFace / OSF). |
> | Replication & Open Re-implementations | Zero publication reward for replicating closed or paper-only pipelines. | Clean, documented open-source Python/Rust implementations of recent neurotech algorithms stuck in proprietary SDKs or MATLAB scripts. |
>
> **3. Operationalizing the Pipeline (Graph → Project)**
>
> To avoid the classic open-source trap where 50 people join a Discord channel and nothing ships after week two, structure the initiative around bounded, modular sprints:
>
> - The "Bounty Board" View: Build a simple frontend over the knowledge graph that filters specifically for high-degree REALLY_WANTS nodes—problems that multiple companies or labs need solved, where no open solution exists.
> - Project Scoping Gate (The "RFC"): Before spinning up a team, a tech lead writes a 1-page Request for Comments defining:
>   - Input/Output contract (e.g., "Takes raw X stream, outputs BIDS-compliant Y").
>   - Definition of Done (e.g., PyPI package + 80% test coverage + 1 working example notebook).
>   - Timebox (e.g., 6–8 weeks).
> - Role Specialization: Enthusiast communities fail when everyone has to do everything. Explicitly separate roles:
>   - Cartographers: Maintain and verify the knowledge graph.
>   - Architects/Leads: Domain experts (grad students, industry engineers) who scope the issue and review PRs.
>   - Builders: Software devs, data scientists, and technical writers executing well-scoped GitHub issues.
> - Industry/Lab "Sponsors" (Zero-Cost Validation): When a REALLY_WANTS edge comes from a real startup or lab, ask them to assign one engineer/postdoc for 1 hour every two weeks to act as the "customer" reviewing the spec—giving volunteers real-world validation and networking without requiring financial sponsorship.
>
> **Immediate Next Steps to Kick Off**
>
> - Step 1: Draft a minimal schema (5–6 node/edge types) and seed 50–100 nodes across the current open-source neurotech stack (acquisition, streaming, processing, hardware).
> - Step 2: Run a focused "Cartography Sprint" with an initial core group of 5–10 NeuroTechX contributors to map the ecosystem and identify the top 5 REALLY_WANTS gaps.
> - Step 3: Launch with one flagship software/interoperability project derived from the graph to prove the pipeline end-to-end before scaling.

**Assistant** (commit `d84a64c`): The repository was empty and the message carried no explicit request, so
it implemented Step 1. Three node types (actor, tech, problem), six edge types, 110 nodes and 168 edges in
YAML, a validator with tests, a static site with a bounty board and a 2D graph view, contributor roles, an
RFC template, issue forms and CI. It reported that all seed data was written from memory and unverified,
that the `REALLY_WANTS` edges were its own guesses, and that the LLM extraction pipeline was not built.

## 2. Reshaping the schema and asking for the viewer

**Owner:**

> A bit more:
>
> The main Sehwag entities of interest here will be projects. These will (almost) always be GitHub repos.
>
> There needs to be a sexy interactive network viz webapp as the entry point to the knowledge graph
> Other key entities will be companies, universities, labs, people
> And then entities, or categories, or something will be technology like EEG, MEG, fMRI
> If it's clinical it will have 'indications' (what it treats)
> There are two fundamental  neurotechnology classes: sensing and modulating
> Invasive vs noninvasive is a big distinction

**Assistant** (commit `772c50c`): Rebuilt the schema around projects with a `repo` field; added `org`,
`person`, `modality`, `indication` and kept `device`; put class and invasiveness on modalities and derived
them for everything else; added clinical devices with indications. Rebuilt the viewer as a full-screen
force-directed network with search, neighbourhood highlighting, three colour modes, facet filters, a detail
panel and deep links, and moved the gaps board to a second tab. 219 nodes, 383 edges. It noted that it had
added the owner himself as lead of EEG-ExPy and invited correction, and that node types use four colour
families plus shape because seven hues failed a colour-blind check.

## 3. Initial projects and companies

**Owner:**

> For an initial set of projects there are the Neurotechx flagship projects:
>
> Neurotechx/EEG-ExPy
> Neurotechx/MOABB
> Neurotechx/neurotechx-website
> Also there are (academic) scientific libraries like mne, nilearn, dipy
> cedalion
> Non python ones like
> FSL, SPM, AFNI, Fieldtrip, Freesurfer
> A few companies to kick us off
>
> OpenBCI
> G.tec
> InteraXon
> Neurosity
> Neuralink
> Kernel
> Paradromics
> NIRX
> ANT Neuro
> Magventure
> Magstim
> EGI
> Siemens
> General Electrics
> Meta
> Neuroelectrics
> Rogue Research
> Divergence Neuro
> Synchroni
> Mendi
> Elemind
> Beacon Biosignals
> PiEEG
>
> Im sure there are lists knocking around that you've found

**Assistant** (commit `7eafdc2`): Added the missing projects (NeuroTechX website, DIPY, Cedalion, FSL, SPM,
AFNI) with their home labs and universities, tagged the three flagships, and added all 23 companies (15
new). It said plainly that it had not been working from any list before; it then cloned
`NeuroTechX/awesome-bci` and added 15 more hardware makers from its hardware section. It added structural
and diffusion MRI as technologies, let organisations declare technologies directly, and added a
`check-repos` command (all repos reachable). 272 nodes, 466 edges. Flagged: `neurotechx-website` is not a
reachable public repo, so `neurotechx.github.io` was used; "Synchroni" matched only an OYMotion sensor line;
Divergence Neuro was described from third-party listings.

## 4. NeuroTechX branding

**Owner:**

> Put the Neurotechx log in the corner
>
> And use the (old) Neurotechx website colour scheme (see aNeurotechx.com)
>
> Give me a preview

**Assistant** (commit `dd4a5cd`): neurotechx.com was unreachable from the sandbox, so it took the logo,
favicon, colours (black, white, teal `#23b2c6`) and heading font (Orbitron) from the 2017 state of
`NeuroTechX/neurotechx.github.io`. Logo top-left, linked to neurotechx.com; dark by default; node colours
moved to teal, yellow, magenta and violet and were re-checked. It sent screenshots, exposed a live preview
port, and asked the owner to say if he meant a different era of the site. No reply on that point yet.

## 5. 3D

**Owner:**

> The network should be 3d viewable rotational

**Assistant** (commits `2eaf4de`, `ce9499f`): Made a rotatable WebGL view the default, with orbit, zoom and
pan, a slow idle spin, solid shapes matching the 2D glyphs, distance fog and distance-scaled labels. Kept
the 2D layout as a toggle and no-WebGL fallback. Bundled the 3D libraries into `web/vendor/`. It said it had
only tested with software WebGL in a headless browser, and that on phones the detail panel can cover the
selected node.

## 6. Hosting

**Owner:**

> I will make the GitHub repo public so you can host it on there

**Assistant** (commit `6b4bd8b`): Explained that Pages deploys only from `main` and asked how to get the
work there. Offered: open a pull request (recommended) or push straight to main.

**Owner** (answering the question): Push straight to main.

**Assistant:** Fast-forwarded `main`. The workflow validated, tested and built successfully; the publish
step failed because GitHub Pages is not enabled. It gave the two settings steps (make the repo public; set
Pages source to GitHub Actions) and warned that going public exposes the unverified seed data, including
guessed wants naming real organisations and clinical claims.

**Owner:**

> Ok

**Assistant:** Re-ran the deploy in case Pages had been enabled. It failed at the same step. Restated the
two steps.

## 7. Saving the conversation

**Owner:**

> Save this conversation and put in the GitHub repo so I can easily switch to another harnesses  get up to speed

**Assistant:** Wrote `AGENTS.md`, `docs/HANDOFF.md`, this file, and `tools/smoke_viewer.js`.
