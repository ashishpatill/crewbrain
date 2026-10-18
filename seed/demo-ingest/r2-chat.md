---
id: S-demo-r2
kind: chat
title: "#infra · signed URLs for lookbook video"
author: ashish
created_at: 2026-10-14T09:40:00+05:30
---
Ashish: Lookbook video is still served on public S3 links, so anyone holding a URL can pass it around forever. Let's switch delivery to CloudFront signed URLs that expire after 1 hour, served from the same Amazon S3 bucket.

Nia: Agreed — delivery only, the originals stay in the bucket where they are. Open a decision and I'll approve it.
