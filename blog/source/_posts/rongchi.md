---
title: 容斥浅谈
date: 2026-10-27 19:42:00
categories:
  - 总结
tags:
  - 数学
  - 组合数学
  - 容斥原理
  - 总结
---
## T1 计算系数

设 $X=ax$，$Y=by$，那么根据二项式定理 $(X+Y)^k$ 展开后 $X^n \cdot Y^m$ 的系数为 $\dbinom{k}{n}$，即当 $a,b$ 不为常量时，$a^n x^n b^m y^m$ 的系数为$\dbinom{k}{n}$，把 $a,b$ 提出来，系数即为 $\dbinom{k}{n} a^n b^m$。

## T2 扮演方案

:::info[简化题意]

给定 $n$（$1 \le n \le 50$）个数，第 $i$ 个数为 $w_i$（$0 \le w_i \le 2^{20}-1$），将这些数分为两组，使得第一组的所有数按位与和第二组所有数按位与的值相等，求这种分组的方案数。

:::

先转化条件，如果在所有数字中这一二进制位存在 `0`，那么每一组这一位中就必须有 `0`。

如果直接计算，要考虑 `0` 的分布，会比较麻烦，所以考虑容斥，通过总方案数减不合法方案数，这样只需要让 `0` 都在一边就可以了。

首先考虑全部方案，就是 $2^n$ 减去空集的方案，即 $2^n-2$。

设 $w_{i,j}$ 代表 $w_i$ 二进制的第 $j$ 位。

即钦定一个 $S$ 集合，其中包含的元素 $k$ 为在第 $k$ 二进制位不合法，想让所有的 $k$ 都违法，那对于每一个 $w_{i,k}=0$ 都要在一起。

枚举这个集合 $S$，朴素算法 $O(2^{n^2}) = O(2^{2n})$ 还要带 $50$ 倍常数，会超时。

考虑使用并查集优化，这样集合之间可以转移，集合 $S$ 可以从集合 $S-\operatorname{lowbit}(S)$，其中 $\operatorname{lowbit}(S)$ 表示 $S$ 从右往左第一位 `1` 的权值。

这样时间复杂度就降到 $O(2^n)$ 带 $50$ 倍常数了。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define sf scanf
#define pf printf
#define ll long long 
#define str string
#define the_end return 0;

const int m=20,B=(1<<20);
int _;
ll no;
vector<ll> v[55];
ll n,wei[B+5],_1[B+5];
int f[B+5][55];

int fi(int b,int x) {
	if(f[b][x]==x) return x;
	return f[b][x]=fi(b,f[b][x]);	
}

int main(){

    cin>>_;
    while(_--){
        cin>>n;
        no=0;
        for(int i=0;i<=53;i++){
        	v[i].clear();
		}
        for(int i=1;i<=n;i++){
            int u;
            cin>>u;
            for(int j=1;j<=m;j++){
                if(((1<<j-1)&u)==0){
                    v[j].push_back(i);
                }
            }
        }
        
        for(int i=1;i<=m;i++){
        	if(v[i].size()==0 || v[i].size()==n){
        		no+=(1<<i-1);
			}
		}
        
        ll ans=(1ll<<n)-2;
        wei[0]=n;
        for(int i=1;i<=n;i++) f[0][i]=i;
        
        for(int i=1;i<B;i++){
            
        	if(i&no) continue;
            int lowbite=(i&(-i));
        	wei[i]=wei[i^lowbite];
    		if(wei[i]==1)continue;
        	_1[i]=_1[i^lowbite]+1;
        	
        	for(int j=1;j<=n;j++){
        		f[i][j]=f[i^lowbite][j];
			}
			
			int k=log2(lowbite)+1;
			for(int j=1;j<v[k].size();j++){
				int y=fi(i,v[k][0]);
				int x=fi(i,v[k][j]);
				if(y!=x){
					f[i][y]=x;
					wei[i]--;
				}
			}
			if(_1[i]&1)ans-=((1ll<<wei[i])-2);
			else ans+=((1ll<<wei[i])-2);
        }
        cout<<ans<<endl;
    }
    
	the_end
}
```
:::

## T3 跳跃

:::info[简化题意]

一个二维网格图，给出 $mx$、$my$、$n$ 和数列 $bad$，每次一步操作，从一个点 （$x,y$） 到另一个点  （$x_1,y_1$），满足以下条件:

- $0 \le x_1-x \le mx$，$0 \le y_1-y \le mx$，点 $(x,y)$ 与点 $(x_1,y_1)$ 不是同一个点。
- 对于 $i=1$ 到 $n$，$x_1-x \ne b_i$ 并且 $y_1-y \ne b_i$。

现在给出 $tx$、$ty$、$r$，求从点 $(0,0)$ 到点 $(tx,ty)$ 恰巧走 $r$ 步的方案数，对 $10007$ 取模。

:::

设 $dp_{i,x,y}$ 表示走了 $i$ 步，到了点 $(x,y)$ 的方案数，如果第一条条件中：点 $(x,y)$ 与点 $(x_1,y_1)$ 可以是同一个点，那么 $dp$ 中的 $x,y$ 便无互斥条件。设 $dpx_{i,x}$ 表示走了 $i$ 步，到了第 $x$ 行的方案数，$dpy_{i,y}$ 表示走了 $i$ 步，到了第 $y$ 列的方案数，则 $dp_{i,x,y}=dpx_{i,x} \times dpy_{i,y}$，然后将 $0$ 加入 $bad$ 数组，就等价于原本的问题。

那么可以分别处理 $dpx$ 和 $dpy$，剩下的就是处理 $bad$ 的数组。

考虑容斥。（考虑容斥的原因：正难则反，这里的问题在独立处理单个条件时可能会涉及到其他条件，且不考虑其他条件是便于处理，其中有重复部分也可以用相似方法处理；本问题中只有一步非法很好处理，但是可能涉及其他违法步数，便有重复步数）

考虑问题本质，实际上无论在第几步非法，只要非法的次数和总非法路程不变，就不会改变答案（这是显然可得的）。

所以设 $f_{i,k}$ 代表再 $r$ 步中有 $i$ 步违法，其中的 $bad$ 和为 $k$ 的方案数，$f$ 数组很好求，`背包dp` 即可。

当我们确立 $f$ 数组时，答案就很好求了，对于 $f_{i,k}$，剩下 $r-i$ 步，剩余网格的长宽分别为 $tx-k,ty-k$ 自由走的方案数就是 $dp_{r-i,tx-k,ty-k}$，同时，无需固定这 $i$ 步在 $r$ 的位置，所以还要乘上 $\dbinom{r}{i}$。

整合得:

$$
dp_{r-i,tx-k,ty-k} \times f_{i,k} \times \dbinom{r}{i}
$$

在一次非法步数时，会重复计算两次非法的，计算两次时，又会重复计算三次的，以此类推。

这就是容斥，由上文得答案为下式:

$$
\sum^r_{i=0} \sum^{\min(tx,ty)}_{k=0} (-1)^i \times dp_{r-i,tx-k,ty-k} \times f_{i,k} \times \dbinom{r}{i}
$$

:::success[Code]

```cpp line-numbers lines=9-69,82-84,86-96
#include <bits/stdc++.h>
using namespace std;
#define sf scanf
#define pf printf
#define ll long long 
#define str string
#define the_end return 0;

const int R=1600,M=800,mod=10007,N=50;
ll dpx[R+5][M+5],dpy[R+5][M+5],f[R+5][M+5],C[R+5][R+5];
ll ans,tx,ty,mx,my,r,n;
vector<ll> bi;

ll jian(ll a,ll b){
	return ((a+mod-b)%mod);
}

int main(){
	
	cin>>tx>>ty>>mx>>my>>r>>n;
	for(int i=1;i<=n;i++){
		int x;
		cin>>x;
		bi.push_back(x);
	}
	
	C[0][0]=1;
	for(int i=1;i<=R;i++){
		for(int j=0;j<=i;j++){
			C[i][j]=C[i-1][j];
			if(j!=0)C[i][j]=(C[i-1][j-1]+C[i][j])%mod;
		}
	}
	
	dpx[0][0]=dpy[0][0]=f[0][0]=1;
	bi.push_back(0);n++;
	for(int i=1;i<=R;i++){
		for(auto v:bi){
			for(int j=v;j<=min(tx,ty);j++){
				f[i][j]=(f[i-1][j-v]+f[i][j])%mod;
			}
		}
	}
	
	for(int i=0;i<=r;i++){
		for(int j=0;j<=tx;j++){
			if(i==0 && j==0)continue;
			if(j!=0)dpx[i][j]=dpx[i][j-1];
			if(i>0){
				dpx[i][j]=(dpx[i][j]+dpx[i-1][j])%mod;
				if(j-mx>0){
					dpx[i][j]=jian(dpx[i][j],dpx[i-1][j-mx-1]);
				}
			}
		}
	}
	
	for(int i=0;i<=r;i++){
		for(int j=0;j<=ty;j++){
			if(i==0 && j==0)continue;
			if(j!=0)dpy[i][j]=dpy[i][j-1];
			if(i>0){
				dpy[i][j]=(dpy[i][j]+dpy[i-1][j])%mod;
				if(j-my>0){
					dpy[i][j]=jian(dpy[i][j],dpy[i-1][j-my-1]);
				}
			}
		}
	}
//	for(int i=0;i<=r;i++){
//		for(int j=0;j<=ty;j++){
//			cout<<dpy[i][j]<<" ";
//		}
//		cout<<endl;
//	}
//	for(int i=0;i<=r;i++){
//		for(int j=0;j<=tx;j++){
//			cout<<dpx[i][j]<<" ";
//		}
//		cout<<endl;
//	}
	for(int i=0;i<=r;i++){
		ll _=C[r][i];
		if(i%2)_=mod-_;
		//cout<<_<<" ";
		for(int j=0;j<=min(tx,ty);j++){
			ans=(ans+_*((f[i][j]*jian(dpx[r-i][tx-j],dpx[r-i][tx-j-1])%mod)*jian(dpy[r-i][ty-j],dpy[r-i][ty-j-1])%mod)%mod)%mod;
			//cout<<ans<<" ";
		}
		//cout<<endl;
	}
	
	cout<<ans;

	the_end
}
```
:::
> 容斥的变式很多，主要还是正难则反。
