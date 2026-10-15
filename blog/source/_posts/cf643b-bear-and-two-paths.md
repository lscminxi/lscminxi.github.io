---
title: 题解：CF643B Bear and Two Paths
date: 2026-10-15 21:20:00
categories:
  - 题解
tags:
  - CF
  - 图论
  - 构造
---
假设有一个点 $e$ 且它不是 $a,b,c,d$ 中的任何一个点，那么考虑一种构造 $a \to c \to e \to d \to \ldots \to b$，此时 $a$ 到 $b$ 的路径是显然的，现在考虑 $c$ 到 $d$ 的情况，可以连边 $(a,e)$ 和 $(e,b)$，此时 $c$ 到 $d$ 的路径有 $c \to a \to e \to b \to \ldots \to d$。

可以证明当 $k \le n$ 时是无解，分类讨论一下，如果 $k=n-1$，只能构造一条链，显然不行。如果 $k=n$，那么只能构造一个环，此时如果想能让 $a$ 到 $b$ 的同时走到任意一个点，那 $a,b$ 必须相邻，也不行，所以最小边数解为 $n+1$。
