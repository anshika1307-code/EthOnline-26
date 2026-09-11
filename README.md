# SafetyGate
> API Safety Checker/ 402 Guard (is it safe to pay this endpoint?)
> Event: ETHGlobal (ETHOnline-2026)
> Team: Solo

## Overview

Thousands of AI agents are now registered on blockchains using a standard called ERC-8004. The registry gives each agent an identity, a place to list services, and a place to collect reputation. 

The problem: almost none of these agents actually work. They are registered and empty. Right now there is no easy way to tell a real, working agent from a dead shell.

We build a readiness checker. It reads the agent registries across several blockchains, scores every agent on how "real" it is, and exposes that score in two ways: a website a human can browse, and an MCP tool an AI agent can call before it decides to trust or pay another agent. The check itself is sold per call using x402, so a buyer agent pays a fraction of a cent for a trust check instead of signing up for anything.

### What we build

### Problem
A July 2026 study of 15 x402 facilitators serving 60,000+ sellers and 360,000+ buyers found rule violations in every one, enabling free shopping, asset theft, service denial and gas abuse (arXiv:2607.19545). A separate study demonstrated five practical attacks producing unpaid-service or paid-but-denied outcomes (arXiv:2605.11781). Meanwhile only 67 of the first 10,000 registered agents even expose a service endpoint (arXiv:2606.12128). Agents are being asked to pay strangers with no way to check first.

### Competitor Analysis
QuickNode's Explorer, Assay Labs and Origin DAO all read on-chain registry data and compute reputation from it. None of them contacts the endpoint. Sumsub's KYA covers compliance identity, not endpoint behaviour. We add the live behavioural layer.

> Before your AI agent pays a stranger's API, Preflight checks whether that endpoint is alive, honestly priced, and actually delivers.

---

## Why this problem is real

This is not just our opinion. It is published research from June 2026.

Paper 1 — the main one to cite From Agent Identity to Agent Economy: Measuring the Operational Readiness of ERC-8004 AI Agents (Mafrur & Khusumanegara, 10 June 2026)

---
