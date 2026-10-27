---
title: "P12426 [BalticOI 2025] BOI acronym"
date: 2026-10-27 19:37:00
categories:
  - 题解
tags:
  - 贪心
  - Ad-hoc
  - 分类讨论
description: "P12426 [BalticOI 2025] BOI acronym 题解"
---
我们可以找到第一个 `B` 存在的位置 $L$ 和最后一个 `B` 存在的位置 $R$，容易发现在 $L$ 之前的位置和在 $R$ 之后的位置对答案没有任何贡献。

由于全局众数为 `B`，即 `B` 的出现次数为 $a_{1,n}$，那么第一个满足 $a_{i,n}=a_{1,n}-1$ 的 $i$ 即为 $L$。同理，第一个满足 $a_{1,i}=a_{1,n}-1$ 的 $i$ 即为 $R$。

那么我们仅需考虑 $[L,R]$ 之间的串即可。

考虑从左到右寻找满足的位置，假设我们现在考虑到了第 $i$ 个位置，找到了 $cnt$ 个 `B`，那么会出现三种情况。

- `B` 是区间 $[L,i-1]$ 的众数，那么如果位置 $i$ 为 `B`，区间 $[L,i]$ 的众数一定还是 `B`，即如果位置 $i$ 为 `B`，一定满足 $a_{L,i}=a_{L,i-1}+1$。

- `B` 是区间 $[i,R]$ 的众数，那么如果位置 $i$ 为 `B`，区间 $[i+1,R]$ 的众数一定还是 `B`，即如果位置 $i$ 为 `B`，一定满足 $a_{R,i}=a_{R,i-1}+1$。

- `B` 不是任何一个区间的众数，由于 `B` 是全局众数，所以左右两边一定不是同一个字母，通过这点，我们分别通过上述方法判断判断位置 $i$ 是否为 `O`/`I`，如果都不是，就只能是 `B` 了。

:::success[code]

```cpp line-numbers
#include<bits/stdc++.h>
using namespace std;

#define sf scanf
#define pf printf
#define ll long long
#define the_end return 0;

const int N=2000;

int n;
int a[N+10][N+10];
int L=1,R=n;

int main(){
	
	cin>>n;
	for(int i=1;i<=n;i++){
		for(int j=i;j<=n;j++){
			cin>>a[i][j];
		}
	}

	R=n;
	if(n==1){
		cout<<1<<endl;
		the_end
	}

	while(a[1][R]==a[1][R-1])R--;
	while(a[L][n]==a[L+1][n])L++;

	cout<<L<<" ";//别忘了 L,R 这两个位置

	int totb=1;
	for(int i=L+1;i<=R-1;i++){
		if(a[L][i-1]==totb && a[L+1][i-1]==totb-1){
    
			if(a[L][i]==a[L][i-1]+1)
				cout<<i<<" ",totb++;
			continue;
		}
		if(a[i][R]==a[L][R]-totb && a[i][R-1]==a[L][R]-totb-1){
			if(a[i][R]==a[i+1][R]+1)
				cout<<i<<" ",totb++;
			continue;
		}
		if(a[i+1][R-1]==a[i][R] && a[L+1][i]==a[L][i-1])
			cout<<i<<" ",totb++;
	}

	cout<<R;

	the_end
}
```
:::
