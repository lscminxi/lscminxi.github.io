---
title: 并查集入门：让每个集合找到自己的根
date: 2026-10-12 16:00:00
categories:
  - 学习笔记
tags:
  - 数据结构
  - 并查集
  - C++
description: 从集合的合并与查询开始，理解路径压缩和按大小合并。附一份带注释的 C++17 模板。
accent: purple
sample: true
---

如果只需要不断合并集合，并查询两个元素是否处于同一个集合，并查集通常就是最直接的工具。

<!-- more -->

## 把集合想成一棵树

每个元素存储一个父节点 `parent[x]`，根节点的父节点是它自己。两个元素在同一个集合中，当且仅当它们的根节点相同。

开始时，每个元素独立成一个集合，也就是 `parent[x] = x`。

并查集有两个基本操作：

- `find(x)`：找到元素 `x` 所属集合的根。
- `unite(a, b)`：合并 `a` 和 `b` 所在的集合。

## 两个优化

### 路径压缩

沿着父指针寻找根时，让经过的节点直接指向根。下次查询这些节点时，就不必重复走一条长链。

### 按大小合并

合并两个集合时，把较小集合的根接到较大集合的根下面。这样可以避免树长得过高。

## C++17 模板

下面的模板采用 `0` 到 `n - 1` 的编号。调用前需要保证编号在合法范围内。

```cpp
#include <iostream>
#include <numeric>
#include <utility>
#include <vector>
using namespace std;

struct DSU {
    vector<int> parent, sz;

    explicit DSU(int n) : parent(n), sz(n, 1) {
        iota(parent.begin(), parent.end(), 0);
    }

    int find(int x) {
        if (parent[x] == x) return x;
        return parent[x] = find(parent[x]);
    }

    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a;
        sz[a] += sz[b];
        return true;
    }

    bool same(int a, int b) {
        return find(a) == find(b);
    }
};

int main() {
    DSU dsu(5);
    dsu.unite(0, 1);
    dsu.unite(1, 2);
    cout << dsu.same(0, 2) << '\n';  // 1
    cout << dsu.same(0, 4) << '\n';  // 0
}
```

## 复杂度与边界

同时使用路径压缩和按大小合并时，单次操作的均摊时间复杂度为 **O(α(n))**，其中 `α` 是反阿克曼函数，增长极其缓慢。初始化需要 **O(n)** 时间，存储数组需要 **O(n)** 空间。

需要注意：

1. 合并的是两个**根节点**，不是直接修改任意节点的父指针。
2. 同一集合的两个元素不能重复累加集合大小。
3. `sz[x]` 只在 `x` 是根时代表当前集合大小。
4. 普通并查集不支持高效拆分集合，也不支持任意删边后的连通性查询。

## 适用场景

并查集可用于维护无向图在不断加边时的连通性，也是 Kruskal 最小生成树算法的重要组成部分。

想继续练习时，可以先写一个朴素的连通块标记程序，再和并查集做随机数据对拍。这比只背住模板更有帮助。
