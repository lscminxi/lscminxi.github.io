---
title: "AT_abc481_f [ABC481F] Evil Shortest Path"
date: 2026-10-27 19:35:00
categories:
  - 题解
tags:
  - 图论
  - 最短路
  - AT
  - 贪心
description: "AT_abc481_f [ABC481F] Evil Shortest Path 题解"
---
首先一定有经过的边越少越优。

设 $d_i$ 表示从 $1$ 到 $i$ 至少要走多少条边才能到达，$dis_i$ 表示从 $1$ 到 $i$ 的最小数字。

那么对于一条边 $(u,v)$，当且仅当有 $d_u+1=d_v$ 时才会进行松弛操作。

于是先跑一遍 bfs 求出 $d_i$，然后再按 $d_i$ 将最终图分层，此时数字的位数对齐了。考虑 $dis_i$ 的松弛，易得对于边 $(u,v)$，若 $u$ 是最佳转移点，则 $dis_v=dis_u \times 10 +w$，$w$ 表示边 $(u,v)$ 的边权。

现在考虑一次松弛操作，设原本的最优点是 $b$，这次要松弛的边是 $(u,v)$，我们需要比较 $dis_b \times 10 +w_b$ 和 $dis_u \times 10 +w_u$，$w$ 是好比较的，重点在于 $dis$，由于位数相同，维护一个 $rk_i$ 表示到达点 $i$ 的最小数字在本层的字典序排名，这样只需要比较 $rk_b$ 和 $rk_u$ 就能得出结果。

每次转移以后考虑维护本层的 $rk$，可以通过上一层的 $rk$ 和最后一位数字 $w$ 在 $\mathcal{O}(k \log k)$ 的时间内维护，其中 $k$ 是本层节点数，综合时间复杂度为 $\mathcal{O}(n \log n)$。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long
#define the_end return 0;

const int N=2e5;
const ll inf=1e18;
const ll Mod=998244353;

struct Node{
	int v,w;
};

int n,m;
ll dis[N+10],diss[N+10];
ll rk[N+10],ans[N+10],ma[N+10];
vector<Node> G[N+10];
vector<int> NG[N+10];
queue<int> q;

bool cmp(int x,int y){
	if(rk[ans[x]]!=rk[ans[y]]) return rk[ans[x]]<rk[ans[y]];
	return ma[x]<ma[y];
}

int main(){

	ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);
	
	cin>>n>>m;
	for(int i=1;i<=n;i++){
		dis[i]=inf;
	}
	dis[1]=0;

	for(int i=1;i<=m;i++){
		int u,v,w;
		cin>>u>>v>>w;
		G[u].push_back({v,w});
	}

	q.push(1);
	while(!q.empty()){
		int u=q.front();
		q.pop();
		for(auto X:G[u]){
			int v=X.v;
			if(dis[v]==inf){
				dis[v]=dis[u]+1;
				q.push(v);
			}
		}
	}

	for(int i=1;i<=n;i++){
		NG[dis[i]].push_back(i);
	}

	rk[0]=1e9;

	for(int i=1;i<=n;i++){
		if(NG[i].size()==0) break;
		for(auto u:NG[i-1]){
			for(auto X:G[u]){
				int v=X.v,w=X.w;
				if(rk[ans[v]]>rk[u] || rk[ans[v]]==rk[u] && w<ma[v]){
					ans[v]=u;
					ma[v]=w;
				}
			}
		}

		sort(NG[i].begin(),NG[i].end(),cmp);

		int cnt=1;
		rk[NG[i][0]]=1;
		for(int j=1;j<NG[i].size();j++){
			int x=NG[i][j],la=NG[i][j-1];
			if(rk[ans[x]]!=rk[ans[la]] || ma[x]!=ma[la]){
				cnt++;
			}
			rk[x]=cnt;
		}

		for(auto x:NG[i]){
			diss[x]=(diss[ans[x]]*10+ma[x])%Mod;
		}
    //每次跑完就统计答案，后续不用考虑边 (u,v) 是否满足松弛条件，因为不满足一定已经统计过答案
	}

	for(int i=2;i<=n;i++){
		cout<<diss[i]<<endl;
	}

	the_end
}
```
:::
