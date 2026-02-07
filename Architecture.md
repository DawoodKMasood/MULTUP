# Serverless File Mirror Uploader Architecture

## Objective

Design a fully serverless backend where a user uploads a file once and the system automatically mirrors the file to multiple third-party hosting websites. The system must:

* Accept multipart uploads via an API
* Temporarily store the file in object storage (S3)
* Dispatch upload tasks to multiple mirror providers
* Execute upload logic in serverless workers
* Use rotating outbound IP addresses
* Track progress and failures
* Delete the file from S3 after completion

This document describes a production-safe architecture using only managed serverless services.

---

## Core Architectural Principle

The system must be **event-driven**, not worker-driven.

Instead of maintaining background workers and queues, we delegate job orchestration to the cloud provider’s managed messaging system.

Serverless systems work best when every operation is:

* stateless
* idempotent
* short-lived
* retryable

The mirror uploader fits perfectly if broken into small tasks.

---

## High Level Flow

```
Client Upload
     ↓
AdonisJS API (Control Plane)
     ↓
S3 (Temporary Storage)
     ↓
SQS Messages (one per mirror)
     ↓
AWS Lambda Worker (auto-spawned)
     ↓
Mirror Website
     ↓
Callback API (update database)
     ↓
Completion Detector
     ↓
Delete from S3
```

---

## Components

### 1. AdonisJS API (Control Plane)

Responsibilities:

* Authenticate user
* Accept multipart upload
* Stream directly to S3
* Create database record
* Create mirror jobs

Important: The API **never uploads to mirror websites**.

After upload completes, it creates one job per mirror provider.

Example mirrors:

* Pixeldrain
* Gofile
* Streamtape
* Filemoon

---

### 2. Object Storage (S3)

S3 is used as **temporary origin storage only**.

Required configuration:

* private bucket
* presigned GET URLs
* lifecycle rule: auto delete after 24–48h (safety cleanup)

The API stores files using streaming upload (not buffering).

After upload finishes, the API generates a presigned URL used by workers.

---

### 3. Managed Queue (Amazon SQS)

For every mirror provider, the API sends a message:

```
Queue: mirror-upload
Message:
{
  "fileId": "uuid",
  "s3Key": "uploads/abc.mp4",
  "mirror": "pixeldrain",
  "attempt": 0
}
```

Key properties used:

* automatic retry
* visibility timeout
* dead letter queue

No queue server must be hosted or maintained.

---

### 4. Upload Worker (Serverless Runtime)

The worker is **not a server and not a background process**.

The worker is an AWS Lambda function that is automatically triggered by SQS.

Every queue message launches a fresh isolated runtime:

```
SQS message → Lambda starts → executes upload → exits
```

Each invocation receives a new outbound IP address, naturally providing IP rotation and reducing mirror-site bans.

Lambda container runtime is the primary execution engine.

---

## Worker Runtime Platform

The correct platform is:

### AWS Lambda (Container Runtime)

Capabilities:

* Node.js 20 runtime
* up to 10 GB RAM
* up to 6 vCPU
* 15-minute execution time
* native HTTP streaming support
* automatic scaling per message

The Lambda function is directly attached to the SQS queue:

```
mirror-upload SQS → mirrorUploadWorker Lambda
```

No polling or worker service exists.

AWS automatically handles:

* concurrency
* retries
* throttling
* scaling
* backpressure

---

## Worker Execution Logic

Input message:

```
fileId
s3Key
mirror
```

Steps performed:

1. Parse SQS event
2. Generate or request presigned S3 URL
3. Stream download file from S3
4. Pipe stream into multipart upload to mirror site
5. Receive mirror URL
6. Send callback to API
7. Exit

Critical implementation rule:

**Never store the file on disk and never buffer in memory.**

Use streaming:

```
S3 Read Stream → FormData Stream → HTTP POST to mirror
```

This allows very large files without memory exhaustion.

---

## Modular Mirror Provider Architecture

The uploader must be modular.
Each mirror website has different authentication, upload fields, and response formats.

Instead of a single uploader file, create a provider system.

### Directory Structure

```
app/
  services/
    mirrors/
      index.ts
      pixeldrain.ts
      gofile.ts
      streamtape.ts
      filemoon.ts
    mirrorDispatcher.ts
  workers/
    mirrorUploadWorker.ts
```

### Provider Contract

Every provider implements the same interface:

```
upload({
  fileStream,
  filename,
  size
}) → returns mirror URL
```

The worker does not know mirror specifics.
It only calls the dispatcher.

### Dispatcher

```
mirrorDispatcher.ts
```

Selects provider:

```
if mirror == "gofile" → gofile.ts
if mirror == "pixeldrain" → pixeldrain.ts
```

This makes adding a new mirror only require creating one new file.

---

## Codebase Strategy (Very Important)

You do **not** create multiple projects.

You create **multiple entrypoints in the same repository**.

One repository produces two deployments:

| Deployment     | Purpose                |
| -------------- | ---------------------- |
| API Runtime    | AdonisJS HTTP server   |
| Worker Runtime | Lambda queue processor |

### Entrypoints

```
entry-api.ts       → starts AdonisJS
entry-worker.ts    → Lambda handler
```

Both import shared services (S3, mirrors, database logic).

---

## Lambda Handler

The worker handler only receives SQS events:

```
export const handler = async (event) => {
  const message = JSON.parse(event.Records[0].body)
  await processMirrorUpload(message)
}
```

The real upload logic lives in shared services, not the handler.

---

## Deployment Model

Build once, deploy twice.

### API Deployment

Runs on:

* VPS
* EC2
* Fly.io
* Railway

### Worker Deployment

Runs on:

* AWS Lambda (container image)

You push a Docker image to AWS ECR and attach it to the Lambda function.

No second codebase required.

---

## Database Design

### files

| field      | purpose                                   |
| ---------- | ----------------------------------------- |
| id         | unique file                               |
| filename   | original name                             |
| size       | bytes                                     |
| status     | pending / processing / completed / failed |
| created_at | upload time                               |

### file_mirrors

| field      | purpose                            |
| ---------- | ---------------------------------- |
| id         | mirror record                      |
| file_id    | relation                           |
| mirror     | provider name                      |
| status     | queued / uploading / done / failed |
| url        | mirror URL                         |
| attempts   | retry counter                      |
| updated_at | last change                        |

---

## Completion Detection

After each worker finishes, it calls:

```
POST /internal/mirror-complete
```

API logic:

1. mark mirror success/failure
2. check if all mirrors finished
3. if finished → delete S3 file

Pseudo-logic:

```
if (all mirrors done OR all failed after retries)
    delete S3 object
    mark file completed
```

---

## Retry Strategy

Handled entirely by SQS.

Configuration:

* visibility timeout: 15–30 minutes
* max receive count: 5
* dead letter queue enabled

If worker crashes or times out:

→ message automatically reappears in queue
→ new worker retries with new IP

No custom retry logic required.

---

## Idempotency (Very Important)

Workers may execute more than once.

The API must accept duplicate callbacks safely.

Rule:

```
If mirror already has URL → ignore duplicate
```

Prevents duplicate writes and race conditions.

---

## Security Controls

### Upload Restrictions

* max file size
* allowed extensions
* rate limit per IP

### Malware Protection

Options:

* ClamAV Lambda scan
* VirusTotal API

Files should be scanned **before mirror jobs are created**.

---

## S3 Deletion Policy

Two layers of deletion are required.

### Primary

After mirrors finish → API deletes file immediately.

### Fallback Safety

S3 lifecycle rule removes leftover files after 24–48 hours.

Prevents unexpected storage costs.

---

## Cost Model (Important Reality)

Main costs:

* S3 storage
* outbound bandwidth
* Lambda execution time

This system is bandwidth-heavy, not CPU-heavy.

Network egress will dominate costs.

---

## Why This Works Without Redis

Traditional queue:

```
App → Redis → Worker Servers
```

Serverless queue:

```
App → SQS → Lambda auto-runs code
```

SQS already provides:

* persistence
* retries
* concurrency control
* scheduling
* backpressure

Redis is unnecessary.

---

## Failure Scenarios Handled

| Scenario       | Result            |
| -------------- | ----------------- |
| worker crashes | job retried       |
| mirror timeout | job retried       |
| IP banned      | new worker new IP |
| API downtime   | SQS retries later |
| callback lost  | retry worker      |
| forgotten file | lifecycle deletes |

---

## Final System Properties

* horizontally scalable
* zero background servers
* automatic IP rotation
* retry-safe
* modular mirror providers
* minimal maintenance

This architecture supports a public mirror hosting platform without the operational overhead of Redis workers or persistent processing servers.
