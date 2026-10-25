---
title: 文化课-数学
date: 2026-10-25 12:51:00
categories:
  - 文化课
tags:
  - 数学-文化课
---
:::info[题目一]

已知函数 $f(x)$ 的定义域为 $\mathbf{R}$，对于 $x\in \mathbf{R}$，定义集合 $S_x=\{y \in \mathbf{R}| f(x)+f(y) \le xy\}$.

（1） 若 $f(x)=\dfrac{1}{2} x^2$，求集合 $S_2,S_{-1}$。

（2） 若 $f(x)$ 满足对任意 $x\in\mathbf{R}$，集合 $S_x$ 均恰好有一个元素 $g(x)$.

- （i）证明：$g(g(x))=x$；
-  （ii） 求所有可能的 $f(x)$

:::

- 1

由题得：

$$
\begin{aligned}
S_{x}=\{y\in\mathbf{R}|x^2+y^2\le2xy\}
\end{aligned}
$$

由基本不等式 $x^2+y^2 \ge 2xy$ 得 $S_x=\{x\}$，所以 $S_{2}=\{2\},S_{-1}=\{-1\}$.

- 2-i

题目给出集合 $S_x$ 有且仅有一个元素 $g(x)$，那么有 $x+g(x)\le xg(x)$，且由 $S_{g(x)}$ 得 $g(x)+g((x)) \le g(x)g((x))$，若 $g(g(x)) \ne x$，那么 $S_{g(x)}$ 中有两个元素，与题目不符。

- 2-ii


