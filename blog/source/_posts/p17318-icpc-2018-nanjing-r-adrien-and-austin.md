---
title: "题解：P17318 [ICPC 2018 Nanjing R] Adrien and Austin"
date: 2026-11-24 18:57:00
categories:
  - 学习笔记
tags:
  - 博弈论
---
首先 $n=0$ 的情况是好考虑的。

$k=1$ 的时候也是好考虑的，只需要判一下奇偶性就可以。

当 $k \ge 2$ 时，先手有必胜策略，具体的，可以将序列分成一模一样的两段，如果 $n$ 为偶数，先手可以在中间取走两个，反之在中间取走一个。接下来先手只需要仿照后手必胜。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1e6;
const int Mod=998244353;

int n,k;

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n>>k;
    if((k==1 && n%2==0) || n==0){
        cout<<"Austin";
    }
    else {
        cout<<"Adrien";
    }
	the_end
}	
```
:::

