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

## 矩阵优化

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

## 例题

:::info[题面]
[P3216](https://luogu.com.cn/problem/P3216) or [670](http://10.3.44.224/p/670)

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


