---
title: 矩阵笔记
date: 2026-11-23 21:44:00
categories:
  - 总结
tags:
  - 矩阵
  - 矩阵加速
---
## 引入

矩阵可以表示一个方程组，形如方程组：

$$
\begin{cases}
x_1+2x_2+3x_3=10\\
4x_1+5x_2+6x_3=11\\
7x_1+8x_2+9x_3=12
\end{cases}
$$

可以表示为：

$$
\begin{bmatrix}
1&  2& 3\\
4& 5& 6\\
7& 8& 9
\end{bmatrix}
\cdot
\begin{bmatrix}
x_1\\
x_2\\
x_3
\end{bmatrix}
=
\begin{bmatrix}
10\\
11\\
12\\
\end{bmatrix}
$$

- 设矩阵 $A,B,C$ 有 $A \cdot B=C$，则有 $C_{i,j}=\sum A_{i,k}B_{k,j}$，易得矩阵有结合律，但是没有交换律，所以可以对矩阵做快速幂。

- 单位矩阵 $I=\begin{bmatrix}
1 & 0 & 0 &\ldots\\
0 & 1 & 0 &\ldots\\
0 & 0 & 1 &\ldots\\
\vdots & \vdots & \vdots & \ddots
\end{bmatrix}$，即 $I_{x,x}=1$，有 $AI=A$。

## 矩阵加速

由于线性递推式可以表示成矩阵乘法的形式，也通常用矩阵快速幂来快速求线性递推数列的某一项。

以斐波那契数列作为例子，可以得出矩阵递推式：

$$
\begin{bmatrix}
f_{i-1} & f_{i-2}
\end{bmatrix}
\cdot
\begin{bmatrix}
1 & 1\\
1 & 0
\end{bmatrix}
=
\begin{bmatrix}
f_{i} & f_{i-1}
\end{bmatrix}
$$

设 $B=\begin{bmatrix}
1& 1\\
1 & 0
\end{bmatrix}$，则 $f_n=B^{n}_{1,1}$

对 $B$ 快速幂可在 $\mathcal{O}(m^3\log n)$ 的时间求出答案，其中 $m$ 是矩阵的大小。

以下是构造一个矩阵的方法：

先考虑斐波那契的递推式：$f_i=f_{i-1}+f_{i-2}$，注意到 $f_i$ 需要用到 $f_{i-1}$ 和 $f_{i-2}$ 两项，所以一个答案矩阵应有 $f_i$ 和 $f_{i-1}$ 两项以推出其他答案，于是可以构造出矩阵：

$$
\begin{bmatrix}
f_{i-1} & f_{i-2}
\end{bmatrix}
\cdot
\begin{bmatrix}
a & c\\
b & d
\end{bmatrix}
=
\begin{bmatrix}
f_{i} & f_{i-1}
\end{bmatrix}
$$

现在要求 $a,b,c,d$ 的值，其实可以通过递推式得出，由矩阵乘法 $C_{i,j}=\sum A_{i,k}B_{k,j}$ 转化得：$f_{i}=af_{i-1}+bf_{i-2},f_{i-1}=cf_{i-1}+df_{i-2}$，易得 $a=1,b=1,c=1,d=0$。

于是便求出了这个矩阵。

实际上，矩阵加速比较灵活。在一些题目中，$C_{i,j}=\sum A_{i,k}B_{k,j}$ 可能不足以表示转移方程，此时可以考虑重定义矩阵乘法，只要保证重定义的运算具有结合律即可。

## 例题：[P3216](https://luogu.com.cn/problem/P3216)

> 矩阵加速入门题

:::info[题面]
给定 $n,m$，设 $S_n$ 是把整数 $1$ 到 $n$ 从小到大依次拼到一起的数，求 $S_n \bmod m$。

$1 \le n \le 10^{18},1 \le m \le 10^9$
:::

设 $f_i$ 表示 $S_i \bmod m$，易得递推式 $f_{i}=f_{i-1} \times 10^{1+\lg {i-1}}+i$。

注意到这个递推式涉及的变量很少，可以考虑矩阵优化。

构造答案矩阵 $\begin{bmatrix}f_{i} & i+1 &1\end{bmatrix}$，其中 $i+1$ 辅助 $f_i$ 转移至 $f_{i+1}$，$1$ 辅助 $i \to i+1$。

得到矩阵形式的递推式：

$$
\begin{bmatrix}
f_{i-1} & i & 1
\end{bmatrix}
\cdot B =
\begin{bmatrix}
f_{i} & i+1 & 1
\end{bmatrix}
$$

简单计数得 $B=\begin{bmatrix}
10^{1+\lg (i-1)} & 0 & 0\\
1 & 1 & 0\\
0 & 1 & 1
\end{bmatrix}$。

对不同的 $1+\lg (i-1)$ 做矩阵快速幂即可，时间复杂度 $\mathcal O (k^3 \log n \lg n)$。

## 例题：[P6772](https://www.luogu.com.cn/problem/P6772)

> 倍增优化矩阵乘法。

:::info[题面]
给定一张 $n$ 个点和 $m$ 条边的有向图，你总共有 $t$ 的时间，到达一个点获得 $c_u$ 的价值，可以重复进过一个点，一条边 $(u,v,w)$ 表示从 $u$ 到 $v$ 需要花 $w$ 的时间。

你有 $k$ 个福利，每个福利给出 $tim_i,x_i,val_i$，当你在 $t=tim_i$ 时到达点 $x_i$，可以获得 $val_i$ 价值的奖励。

现在要求最大价值。

$1 \le n \le 50,1 \le n \le m \le 500,0 \le k \le 200,1 \le tim \le t \le 10^9,1\le w \le 5$。
:::

容易考虑到朴素的 dp。设 $f_{i.j}$ 表示 $t=i$ 时到达了点 $j$ 的最大价值，易得转移方程 $f_{i,v}=\max_{v \in son_u} f_{i-w,u}+c_v+val$，其中 $w$ 是边 $u,v$ 的边权，$val$ 是当前时间和地点的福利奖励。

这个东西和朴素的矩阵乘法 $C_{i,j}=\sum A_{i,k}B_{k,j}$ 完全沾不上关系。注意到矩阵优化动态规划只需要满足运算的结合律，所以我们新定义一个矩阵运算，设矩阵 $C=A \oplus B$ 有 $C_{i,j}=\max \{A_{i,k}+B_{k,j}\}$。易证这个运算有结合律。

设答案矩阵为 $A$，构造一个辅助矩阵 $B$，当 $u$ 到 $v$ 时能获得 $c_v$ 的价值，即 $B_{u,v}=c_v$。

由于 $w$ 不是很好处理，注意到 $w \le 5$，考虑将每个点拆成 $5$ 个点，对于一条边 $(u,v,w)$，将 $u_w$ 连向 $v_1$，这样矩阵中就只用从 $i-1$ 转移到 $i$。

考虑上 $k$ 个福利，可以对于两个福利之间分开求，对于福利 $i$，答案矩阵有变化： $A \leftarrow A \oplus B^{tim_i-tim_{i-1}}$，同时记上福利价值，即 $A_{1,x} \leftarrow A_{1,x}+val$。

目前算法是 $\mathcal O(k(wn)^3 \log t)$。需要优化。

注意到对于不同的 $i$，$B$ 始终不变，所以考虑倍增优化，考虑预处理出 $B^p$ 的值，其中 $p=2^x$，对于一次操作，只需要 $\mathcal O((wn)^2 \log t)$ 的时间。加上预处理倍增 $\mathcal O(n^3 \log t)$，总时间 $\mathcal O(k(wn)^2\log t+n^3 \log t)$。

## 例题：[CF570E](https://www.luogu.com.cn/problem/CF750E)

> 线段树维护矩阵。

:::info[题面]
给出一个数字串 $S$ 和 $q$ 次询问，每次询问子串 $S_{l,r}$ 要删除多少个字符才能使其包含**子序列** $\texttt{2017}$ 而不包含 $\texttt{2016}$。

设 $n=|S|$，则 $1 \le l \le r \le n \le 2 \times 10^5,1 \le q \le 2 \times 10^5$。
:::

考虑一个朴素的 dp：设 $f_{0/1/2/3/4}$ 表示 $[1,i]$ 中包含子序列 $\emptyset\texttt{/2/20/201/2017}$ 最少要删除多少个字符。

易得转移：

$$
\begin{cases}
f_{i,0}=f_{i-1,0}+[s_i=2]\\
f_{i,1}=\min \{f_{i-1,1}+[s_i=0],f_{i-1,0}[s_i=2]\}\\
f_{i,2}=\min \{f_{i-1,2}+[s_i=1],f_{i-1,1}[s_i=0]\}\\
f_{i,3}=\min \{f_{i-1,3}+[s_i=7],f_{i-1,2}[s_i=1]\}\\
f_{i,4}=\min \{f_{i-1,4}+[s_i=6],f_{i-1,3}[s_i=7]\}
\end{cases}
$$

其中 $[P]$ 表示艾佛森括号，需要注意形如 $f_{i,j}=f_{i-1,j-1}[s_i=x]$ 的转移在 $s_i \ne x$ 时不成立。

经典的，为了适配 dp，我们定义 $C=A \oplus B$ 有 $C_{i,j}=\min\{A_{i,k}+B_{k,j}\}$。

注意到这题对于每一个数字都能构造出一个矩阵，设 $s_i$ 构造出的矩阵是 $A_i$，那么 $f_{i,4}=C_{1,1}$，其中 $C=\bigoplus_{j=1}^i A_j$。这启示我们子串 $S_{l,r}$ 的答案矩阵为 $\bigoplus_{j=l}^r A_j$，由于矩阵具有结合律，所以可以考虑用线段树维护这个答案矩阵。

时间复杂度 $O(w^3n\log n+w^3q\log n)$，其中 $w$ 表示辅助矩阵 $A$ 的大小。
