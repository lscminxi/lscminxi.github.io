---
title: 生成树杂题
date: 2026-10-21 21:15:00
categories:
  - 总结
tags:
  - 图论
  - 生成树
---
## [CF959E](https://www.luogu.com.cn/problem/CF959E)

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

## [CF1245D](https://www.luogu.com.cn/problem/CF1245D)

:::info[简化题面]
有一张 $n$ 个点的完全图，每个点有 $4$ 个信息 $x,y,k,c$。

你可以点亮一些点，将点 $i$ 点亮需要 $c_i$ 的价值，而一条边 $(i,j)$ 可以传递光，使用边 $(i,j)$ 的代价是 $(|x_i-x_j|+|y_i-y_j|)(k_i+k_j)$。

现在要求让所有点都有光的最小代价及其方案。

$1 \le n \le 2 \times 10^3,1\le x_i,y_i \le 10^6,1\le k_i,c_i \le 10^9$
:::

其实就是找一个最小生成树，但是点权是不太好考虑的。

考虑建一个超级源点，设为 $0$，使得 $(0,i)$ 的边权是 $i$ 的点权 $c_i$。

然后在这张完全图上跑最小生成树就好了，时间服杂度 $\mathcal{O}(n^2 \log n^2)$。~~（其实可以跑 prim 优化到 $\mathcal{O} (n^2)$）~~

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=2000;

struct Node{
    ll x,y,cost,k;
};

struct Edge{
    ll u,v,w;
};

ll n,m,an;
ll f[N+10];
Node pos[N+10];
Edge a[N*N+10],ans[N*N+10];

inline int find(int x){
    if(f[x]==x) return x;
    return f[x]=find(f[x]);
}

inline bool cmp(Edge x,Edge y){
    return x.w<y.w;
}

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n;

    for(int i=1;i<=n;i++){
        f[i]=i;
    }

    for(int i=1;i<=n;i++){
        cin>>pos[i].x>>pos[i].y;
    }

    for(int i=1;i<=n;i++){
        cin>>pos[i].cost;
    }

    for(int i=1;i<=n;i++){
        cin>>pos[i].k;
    }

    for(int i=1;i<=n;i++){
        a[++m]={0,i,pos[i].cost};
        a[++m]={i,0,pos[i].cost};
    }

    for(int i=1;i<=n;i++){
        for(int j=1;j<i;j++){
            ll calc=abs(pos[i].x-pos[j].x)+abs(pos[i].y-pos[j].y);
            a[++m]={i,i,calc*(pos[i].k+pos[j].k)};
            a[++m]={i,j,calc*(pos[i].k+pos[j].k)};
        }
    }

    sort(a+1,a+1+m,cmp);

    ll cur=0;

    for(int i=1;i<=m;i++){
        int u=find(a[i].u),v=find(a[i].v);
        if(u==v) continue;
        f[u]=v;
        ans[++an]=a[i];
        cur+=a[i].w;
        if(an==n)break;
    }

    int tot=0;

    for(int i=1;i<=an;i++){
        if(ans[i].u==0 || ans[i].v==0){
            tot++;
        }
    }

    cout<<cur<<"\n"<<tot<<endl;

    for(int i=1;i<=an;i++){
        if(ans[i].u==0){
            cout<<ans[i].v<<" ";
        }
        if(ans[i].v==0){
            cout<<ans[i].u<<" ";
        }
    }

    cout<<endl<<n-tot<<endl;

    for(int i=1;i<=n;i++){
        if(ans[i].u!=0 && ans[i].v!=0){
            cout<<ans[i].u<<' '<<ans[i].v<<endl;
        }
    }
	
    the_end
}
```
:::


