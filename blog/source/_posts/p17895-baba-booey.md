---
title: P17895 BABA BOOEY 题解
date: 2026-11-19 18:43:00
categories:
  - 题解
tags:
  - 博弈论
  - Ad-hoc
---
设 $sum=\sum a_i$。

首先如果 $sum$ 为奇数，那么先手第一步取一个 $x=1$ 必胜。

当 $sum$ 为偶数时，先后手都一定会取偶数。考虑将 $k$ 与 $a_i$ 同时除二下取整，即 $k'=\lfloor\dfrac{2}{k}\rfloor,a'_i=\lfloor \dfrac{a_i}{2} \rfloor$。可以证明此时这个子游戏等价于原游戏。

:::info[证明]
由于先后手一定取偶数，所以每次操作后有 $k\leftarrow x=2t$，设本次对 $a_i$ 操作，那么有 $a_i \leftarrow a_i-2t$。

现在考虑转化成子局面，子局面中 $x'=t$。

注意到 $0\le 2t \le k$ 等价于 $0 \le t \le k'$，且 $2t \le a_i$ 等价于 $t\le a'_i$，操作后 $a_i-2t$ 等价于子游戏中 $\lfloor \dfrac{a_i-2t}{2}\rfloor=\lfloor \dfrac{a_i}{2} \rfloor-t$，即 $a'_i-t$。

所以原游戏中的操作和子游戏中的操作都是对称的，即这个子游戏等价于原游戏。
:::

于是可以一直转化直到 $sum'=\sum a'_i$ 为奇数。

现在需要考虑转化后还能否操作，假设转化了 $j$ 次，那么 $sum'$ 的奇偶性为 $\sum \lfloor \dfrac{a_i}{2^j} \rfloor$ 的奇偶性，注意到这正是所有 $a_i$ 的第 $j$ 位的值异或，具体的，设 $x=\bigoplus_{p=1}^n a_p$，那么第 $j$ 次转化后奇偶性为 $x$ 的第 $j$ 位。

如果先手想要获胜，那么 $j$ 次操作后 $k'>0$，即 $k \ge 2^j$，考虑到 $sum'$ 变成奇数时 $x$ 的第 $j$ 位一定时 $1$，所以 $j=\log_2\operatorname{lowbit}(x)$，然后判断一下 $k \ge 2^j$ 即可。

:::success[Code]
```
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1e6;

int n,m;
ll a[N+10],sum,ma;

inline void solve(){
    cin>>n>>m;
    sum=0,ma=0;
    for(int i=1;i<=n;i++){
        cin>>a[i];
        sum^=a[i];
        ma=max(ma,a[i]);
    }

    if(sum==0){
        cout<<"Bob\n";
        return ;
    }
    else {
        int x=sum&(-sum);
        if(x<=m){
            cout<<"Alice\n";
        }
        else {
            cout<<"Bob\n"; 
        }
    }
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);
	
    int _;
    cin>>_;
    while(_--){
        solve();
    }

    the_end
}
```
:::
