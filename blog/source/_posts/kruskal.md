---
title: 浅谈 Kruskal 重构树
date: 2026-10-23 14:52:00
categories:
  - 学习笔记
tags:
  - 图论
  - 生成树
  - kruskal 重构树
---
## 构造

在使用 kruskal 建生成树的时候，我们会按照边权的大小来排序，这里假设边权由小到大排序。与建生成树不同的是，我们不以边连接两个点，而是新建一个点，将两个点所在的联通块连起来，将点的点权设为原本的边权。

具体的，设原本的生成树如下图：

```graph
algo: mst
directed: true
edge: 1 -- 2 ; weight=3
edge: 2 -- 3 ; weight=1
edge: 3 -- 5 ; weight=4
edge: 2 -- 4 ; weight=2
edge: 1 -- 5 ; weight=1
edge: 1 -- 4 ; weight=6
node: 1 ; x=0 ; y=-110
node: 2 ; x=27.99 ; y=-20.52
node: 3 ; x=85.79 ; y=48.02
node: 4 ; x=-24.98 ; y=53.31
node: 5 ; x=-42.96 ; y=-25.81
```

那么这张图的 kruskal 重构树为：

```graph
algo: none
directed: true
edge: 1 -- 6 ;
edge: 5 -- 6 ;
edge: 2 -- 7 ;
edge: 3 -- 7 ;
edge: 4 -- 8 ;
edge: 7 -- 8 ;
edge: 6 -- 9 ;
edge: 8 -- 9 ;
node: 6 ; x=-152.65 ; y=185.52
node: 1 ; x=-116.44 ; y=243.37
node: 2 ; x=-48.79 ; y=241.67
node: 4 ; x=-80.49 ; y=243.37
node: 7 ; x=-25.86 ; y=207.72
node: 3 ; x=2.8 ; y=241.67
node: 5 ; x=-181.94 ; y=243.37
node: 8 ; x=-56.9 ; y=167.22
node: 9 ; x=-91.31 ; y=131.33
```
## 性质

- 容易发现这个重构树是一个二叉树，同时每个非叶子节点恰好有两个子节点。
- 一条路径 $u,v$ 上的最大值为生成树上路径 $u,v$ 上边的最大值，转化到 kruskal 重构树上这个最大值等于点 $\operatorname{lca}(u,v)$ 点权。
- kruskal 重构最小生成树是一个大根堆，即父节点一定比字节点大。

## 例题

## [P1967](https://www.luogu.com.cn/problem/P1967)

:::info[简化题意]
:::

板子题，先预处理出 kruskal 重构树，对于每个询问，先判断 $x,y$ 是否在一棵树上，然后求出 $\operatorname{lca}(u,v)$ 的点权即可。
