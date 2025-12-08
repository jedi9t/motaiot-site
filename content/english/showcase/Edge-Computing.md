---
title: "GenAI-Driven Edge Computing & NPU Optimization" 
meta_title: "GenAI & Edge AI for Smart Elevator Safety" 
description: "Revolutionizing object detection with synthetic data generation and NPU quantization for real-time electric scooter detection in elevators." 
date: 2025-12-08T00:00:00Z 
# youtube_id: ""
image: "/images/showcase/Edge-Computing/AI-Workflow-Pipeline.jpg"
categories: ["Showcase"]
tags: ["GenAI", "Edge Computing", "Computer Vision", "NPU", "IoT", "AI"]
draft: false
---
### The Challenge: Safety & Data Scarcity in Vertical Transport

Preventing electric scooters from entering elevators is a critical safety requirement to mitigate fire risks in high-rise buildings. However, developing a robust detection system presents significant hurdles for traditional AI development.

Key challenges include:

* Data Scarcity & Privacy: Collecting thousands of real-world images of scooters in elevators is time-consuming, costly, and fraught with privacy regulations (GDPR) regarding passenger faces.

* Corner Cases: It is difficult to physically stage every possible angle, lighting condition, and occlusion scenario (e.g., crowded elevators) to train a resilient model.

* Edge Constraints: The deployment environment—an elevator car—requires a solution with ultra-low latency, low power consumption, and offline capability, ruling out cloud-based inference.

### The Solution: A GenAI-First Workflow & Edge Quantization

MOTA TECHLINK reimagined the workflow by shifting from "Data Collection" to "Data Generation". We deployed an end-to-end pipeline that combines Generative AI for synthetic data creation with advanced NPU optimization for edge deployment. This approach reduced the development cycle from months to days.

<!-- {{< slider dir="images/showcase/elevator-scooter/genai-process" class="max-w-[800px] mx-auto" height="200" width="300" webp="true" option="" zoomable="true" >}}
{{< slider dir="images/showcase/elevator-scooter/edge-deployment" class="max-w-[800px] mx-auto" height="200" width="300" webp="true" option="" zoomable="true" >}} -->

Our advanced methodology consists of several key stages:

1. Synthetic Data Generation (GenAI): Instead of waiting for real data, we utilized Multimodal Large Language Models (LLMs) to generate photorealistic scenes. By inputting prompts describing various elevator interiors and scooter models, we created a diverse and privacy-compliant dataset covering rare "corner cases" that are impossible to capture manually.

2. Automated Annotation with SAM: Manual labeling is the bottleneck of AI training. We integrated the Segment Anything Model (SAM) into our pipeline to automatically generate pixel-perfect bounding boxes and segmentation masks for the synthetic dataset. This automation reduced data preparation time by 90% while ensuring consistent label quality.

3. NPU Quantization & Edge Deployment: To run on cost-effective IoT hardware, we compressed the YOLO/ResNet model using Post-Training Quantization (PTQ). We optimized the model for specific NPU (Neural Processing Unit) architectures (e.g., RISC-V/ARM), reducing model size by 75% without compromising accuracy.

4. Real-time Logic & Control: The system is not just a camera; it is a controller. Upon detecting a target with high confidence (>0.85), the edge device triggers a relay to hold the elevator doors open and plays a voice alert, physically preventing the safety hazard until the object is removed.

By leveraging Synthetic Data and Edge Computing, this solution proves that MOTA TECHLINK can rapidly deploy industrial-grade AI logic into physical hardware, solving safety challenges with speed, privacy compliance, and cost-efficiency.
