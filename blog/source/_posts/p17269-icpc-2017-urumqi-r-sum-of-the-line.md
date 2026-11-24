---
title: "P17269 [ICPC 2017 Urumqi R] Sum of the Line"
date: 2026-11-24 19:33:00
categories:
  - 题解
tags:
  - 容斥原理
  - 数学
---
简化题意：

$$
\begin{aligned}
\sum^k_{c=1} S_{k,c} &= \sum^k_{c=1} \sum^k_{i=c} [\gcd(k,i)=1] \times i \\
&=\sum_{c=1}^k [\gcd(k,c)=1] \times (\sum_{j=1}^c c)\\
&=\sum_{c=1}^k [\gcd(k,c)=1] c^2
\end{aligned}
$$

直接计算显然会超时，所以考虑正难则反。

问题就转化为求出与 $k$ 互质的那些数，这是一个经典容斥问题。

最开始将答案记为 $\sum^{k}_{i=1} i^2$，这个式子等于 $\dfrac{k(k+1)(2k+1)}{6}$。

::::info[证明]

设 $S=\sum^n_{i=1} i^2$。

则有：

$$
\begin{aligned}
S &=\sum^n_{i=1} \sum^n_{j=i} j\\
&= \sum^n_{i=1} \frac{(i+n)(n-i+1)}{2} \\
&= \frac{1}{2} \sum^n_{i=1} (n+1)n+i-i^2 \\
&= \frac{1}{2}(\sum^n_{i=1} (n+1)n + \sum^n_{i=1} i - \sum^n_{i=1}i^2) \\
&=\frac{1}{2} (n+1)n^2 + \frac{1}{4}(n+1)n-\frac{1}{2} S
\end{aligned}
$$

即：

$$
\begin{aligned}
\frac{3}{2}S &=\frac{1}{2} (n+1)n^2 + \frac{1}{4}(n+1)n\\

3S &= (n+1)n^2+\frac{1}{2}(n+1)n\\
&=\frac{2(n+1)n^2+(n+1)n}{2} \\
&=\frac{(n+1)(2n^2+n)}{2} \\
&=\frac{(n+1)(2n+1)n}{2} \\
S &= \frac{n(n+1)(2n+1)}{6}
\end{aligned}
$$
::::

将 $k$ 分解质因数，这些质数的倍数一定不会和 $k$ 互质，直接减去它们的贡献，贡献是好求的，假设这个质数为 $p$，那么 $p$ 的倍数即为 $p,2p,3p\dots$，它们的贡献和为：

$$ 
\begin{aligned}
\sum^{n}_{i=1} (i\times p)^2 &= \sum^{n}_{i=1} i^2 p^2 \\
&= p^2 \times \frac{n(n+1)(2n+1)}{6}
\end{aligned}
$$

其中 $n=\lfloor \frac{k}{p} \rfloor$。

发现一个数可能同时为两个质数的倍数，这一部分会算重复，所以要减去这些数的倍数的贡献。

一个数也有可能为三个质数的倍数，此时又会重复，要把它们的贡献算回来。

以此类推，最终答案即为：

$$
\sum_{S\subseteq P} (-1)^{|S|}  x^2 \sum^{\lfloor \frac{k}{x} \rfloor}_{i=1} i^2
$$

其中 $x$ 是集合 $S$ 中所有数的积，$|S|$ 表示集合 $S$ 中的元素个数，集合 $P$ 为 $k$ 的质因数集。

单次询问时间复杂度为 $\mathcal{O}(\sqrt{k}+ 2^m)$，其中 $m$ 是 $k$ 中不同质因数的数量，实际计算以后发现 $m \le 9$，可以通过本题。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const ll Mod=998244353,N=1e4;
ll _,n,p[N+10],m;

inline ll fpow(ll a,ll b){
	ll sum=1;
	while(b){
		if(b&1)sum=(sum*a)%Mod;
		b>>=1;
		a=(a*a)%Mod;
	}
	return sum;
}

inline ll Spow(ll x){
	return ((x*(x+1)%Mod)*((2*x+1)*fpow(6,Mod-2)%Mod))%Mod;
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>_;

	while(_--){
		cin>>n;
		ll sqr=n;

		m=0;
		for(int i=2;i<=sqrt(sqr);i++){
			if(!(sqr%i)) p[++m]=i;
			while(!(sqr%i)){
				sqr/=i;
			}
		}

		if(sqr-1)p[++m]=sqr;

		ll S=1ll<<m,ans=0;

		for(int s=0;s<S;s++){
			ll cnt=1,tot=0;
			for(int i=1;i<=m;i++){
				if(s&(1<<(i-1))){
					cnt=(cnt*p[i])%Mod;
					tot++;
				}
			}
			if(tot&1){
				ans=(ans-((cnt*cnt)%Mod)*(Spow(n/cnt))%Mod+Mod)%Mod;
			}
			else {
				ans=(ans+((cnt*cnt)%Mod)*(Spow(n/cnt))%Mod)%Mod;
			}
		}

		cout<<ans<<endl;
	}
	
	the_end
}

```
:::
