---
title: "题解：P11383 [POI 2024/2025 R1] Sprawiedliwy podział"
date: 2026-10-19 14:24:00
categories:
  - 学习笔记
---
设两个人的选择的集合为 $X$ 和 $Y$，称选择一个集合合法为选择该集合不会嫉妒对方，容易证明，选择到价值较大的集合是一定合法的。

首先对 $a$ 降序排序，遍历 $a$，哪一边的集合小就放到那边，可以证明这样选择对于第一个人，选择集合 $X$ 或 $Y$ 都是合法的。

:::info[证明]

我们称一种局面是合法的为对于第一个人，选择集合 $X$ 或 $Y$ 都是合法的

假设现在的局面是合法的。

记一个集合 $X$ 中物品在第一个人眼中的价值是 $X_a$，钦定 $X_a \ge Y_a$。

现在我们要加入一个物品 $x$ 到集合 $Y$ 中，设加入后的集合 $Y$ 为 $Y'$。

如果 $X_a\ge Y_a+a_x$，那么选择集合 $X$ 一定是合法的，而由于原本选择 $Y$ 就是合法的，$Y_a$ 变大了也一定合法。

如果 $X_a<Y_a+a_x$，那么选择集合 $Y'$ 一定是合法的，由于 $a$ 降序排序，所以集合 $Y'$ 中的最小值为 $a_x$，那么 $Y'_a-\min_{i \in Y'} a_i=Y_a$，由于 $X_a \ge Y_a$，所以选择集合 $X$ 也是合法的。

最开始的局面为 $X_a=0$ 且 $Y_a=0$，这个局面是合法的。

那么便可以推得后面的局面也是合法的。

:::

那么便不用在考虑第一个人，然后让第二个人选择在他眼中价值较大的那个集合即可。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=5e5;

struct Node{
	ll a,b,idx,flag;
	friend Node operator + (Node x,Node y){
		return Node{x.a+y.a,x.b+y.b,x.idx,x.flag};
	}
};

Node r[N+10],suma,sumb;
ll n;

bool cmpa(Node x,Node y){
	return x.a>y.a;
}

bool cmpidx(Node x,Node y){
	return x.idx<y.idx;
}

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>n;
	for(int i=1;i<=n;i++){
		cin>>r[i].a;
	}

	for(int i=1;i<=n;i++){
		cin>>r[i].b;
		r[i].idx=i;
	}

	sort(r+1,r+1+n,cmpa);

	for(int i=1;i<=n;i++){
		if(suma.a<sumb.a){
			suma=suma+r[i];
            r[i].flag=0;
		}
		else {
			sumb=sumb+r[i];
			r[i].flag=1;
		}
	}

    if(suma.b>sumb.b){//如果现在的这个集合在第二个人眼中的价格较低，那么就把两个集合交换，让第二个人选择另一个集合
        for(int i=1;i<=n;i++){
            r[i].flag=1-r[i].flag;
        }
    }

    sort(r+1,r+1+n,cmpidx);

	for(int i=1;i<=n;i++){
		cout<<r[i].flag<<" ";
	}
	
	the_end
}
```
:::
