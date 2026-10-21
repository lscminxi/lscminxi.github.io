---
title: 生成树杂题
date: 2026-10-21 21:15:00
categories:
  - 总结
tags:
  - 图论
  - 生成树
---
[CF959E](https://www.luogu.com.cn/problem/CF959E)

:::info[简化题面]
给一个有 $n$ 个顶点的完全图，顶点为 $0,1,\ldots,n-1$，一条边 $(i,j)$ 的权值为 $i \oplus j$，求这个图的最小生成树。

$1 \le n \le 10^{12}$
:::

由异或考虑二进制，假设有 $k$ 位。

考虑模拟 Kruskal，每次选择最小的边，边权为 $1$ 的边有 $\lfloor \frac{n}{2} \rfloor$，先把这些边选上，这些边会将前 $k-1$ 位相同的数字联通。

然后选择边权为 $2$ 的边，这些边会把前 $k-2$ 位相同的联通。

注意到当把边权为 $x=2^t$ 加入选择边时，前 $k-t$ 位相同的会联通，推得会添加 $\lceil \frac{n}{x} \rceil$ 条边。

所以对于每个 $x=2^t$，贡献为 $x\lfloor \dfrac{\lceil \frac{n}{x} \rceil}{2} \rfloor$，答案为 $\sum x\lfloor \dfrac{\lceil \frac{n}{x} \rceil}{2} \rfloor$。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

ll n,ans;

int main(){

	ios::sync_with_stdio(false);
	cin.tie(0),cout.tie(0);

	cin>>n;
	for(ll i=1;i<=n;i*=2ll){
		ans+=i*((n+i-1)/i/2ll);
	}
	cout<<ans<<endl;

    the_end
}
```
:::
