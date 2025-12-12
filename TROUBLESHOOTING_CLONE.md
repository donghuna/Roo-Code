# Git Clone 403 에러 해결 가이드

## 문제
```
RPC failed: HTTP 403 curl 22 the requested URL returned error: 403
fatal: expected 'packfile'
```

## 원인 분석

이 저장소는 다음과 같은 특성을 가지고 있습니다:
- **커밋 수**: 6,367개 (상당히 큰 히스토리)
- **저장소 크기**: 약 301MB의 packfile
- **LFS 파일**: `demo.gif` 1개만 존재

**실제 원인**: LFS 자체의 문제가 아니라, **전체 히스토리를 다운로드하는 과정에서 발생하는 네트워크/서버 제한 문제**입니다.

- ✅ Shallow clone (`--depth 1`) 성공 → 기본 접근은 가능
- ❌ 전체 히스토리 clone 실패 → 큰 데이터 전송 시 문제 발생

가능한 원인:
1. **네트워크 타임아웃**: 301MB의 전체 히스토리를 다운로드하는 동안 타임아웃
2. **사내 네트워크 제한**: 큰 단일 요청에 대한 제한
3. **Git 서버 제한**: GitHub이 큰 요청에 대해 403 반환
4. **LFS 간접 영향**: 히스토리 중 LFS 파일 참조 처리 중 문제

## 해결 방법

### 1. Git LFS 인증 문제 해결

이 저장소는 Git LFS를 사용합니다. LFS 파일 다운로드 시 인증이 필요할 수 있습니다.

#### 방법 A: Git LFS 스킵 (빠른 테스트용)
```bash
# LFS 없이 clone 시도
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/RooCodeInc/Roo-Code.git
cd Roo-Code
git lfs pull
```

#### 방법 B: Git Credential 설정
```bash
# Windows Credential Manager 사용
git config --global credential.helper manager-core

# 또는 Personal Access Token 사용
git clone https://<YOUR_TOKEN>@github.com/RooCodeInc/Roo-Code.git
```

### 2. GitHub 인증 설정

#### Personal Access Token 생성 및 사용
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. `repo` 권한으로 토큰 생성
3. Clone 시 사용:
```bash
git clone https://<YOUR_TOKEN>@github.com/RooCodeInc/Roo-Code.git
```

#### SSH 키 사용 (권장)
```bash
# SSH 키 생성 (없는 경우)
ssh-keygen -t ed25519 -C "your_email@example.com"

# SSH 키를 GitHub에 등록 후
git clone git@github.com:RooCodeInc/Roo-Code.git
```

### 3. 사내 네트워크/프록시 설정

#### 프록시 설정
```bash
# HTTP 프록시 설정
git config --global http.proxy http://proxy.company.com:8080
git config --global https.proxy https://proxy.company.com:8080

# 프록시 인증이 필요한 경우
git config --global http.proxy http://username:password@proxy.company.com:8080
```

#### SSL 검증 우회 (임시, 보안 위험 있음)
```bash
# 사내 인증서 문제인 경우 (권장하지 않음)
git config --global http.sslVerify false
```

### 4. Git LFS 별도 설정

```bash
# Git LFS 설치 확인
git lfs version

# Git LFS가 없다면 설치
# Windows: https://git-lfs.github.com/

# LFS 자격 증명 설정
git lfs install
```

### 5. 단계별 디버깅

```bash
# 1. 원격 저장소 접근 테스트
git ls-remote https://github.com/RooCodeInc/Roo-Code.git

# 2. LFS 파일 목록 확인
git lfs ls-files

# 3. 상세 로그로 clone 재시도
GIT_TRACE=1 GIT_CURL_VERBOSE=1 git clone https://github.com/RooCodeInc/Roo-Code.git

# 4. Git 설정 확인
git config --list --show-origin
```

### 6. ✅ 권장: Shallow Clone (가장 안정적)

**이 방법이 가장 확실하게 작동합니다!**

```bash
# 전체 히스토리 없이 최신 버전만 clone
git clone --depth 1 https://github.com/RooCodeInc/Roo-Code.git

# LFS 파일은 나중에 pull
cd Roo-Code
git lfs pull
```

**장점**:
- 전체 히스토리(301MB) 대신 최신 버전만 다운로드 (훨씬 빠름)
- 네트워크 타임아웃 문제 회피
- 개발에는 충분함 (대부분의 경우 전체 히스토리가 필요 없음)

**나중에 전체 히스토리가 필요하면**:
```bash
git fetch --unshallow
```

### 7. 대안: 부분 히스토리 Clone

```bash
# 최근 100개 커밋만 가져오기
git clone --depth 100 https://github.com/RooCodeInc/Roo-Code.git

# 또는 특정 브랜치만
git clone --depth 1 --branch main https://github.com/RooCodeInc/Roo-Code.git
```

## 사내 환경 특화 해결책

### 사내 Git 서버 미러 사용
사내에 GitHub 미러가 있다면:
```bash
git clone https://internal-git.company.com/RooCodeInc/Roo-Code.git
```

### VPN 사용
사내 네트워크에서 GitHub 접근이 제한된 경우 VPN 연결

### IT 부서 문의
- 사내 프록시 설정 정보
- GitHub 접근 권한
- Git LFS 사용 정책

## 추가 참고사항

- 이 저장소는 공개 저장소이므로 인증 없이도 접근 가능해야 합니다
- **403 에러의 실제 원인**: 전체 히스토리(약 301MB) 다운로드 시 네트워크/서버 제한
- **권장 해결책**: `--depth 1` 옵션으로 shallow clone (가장 안정적)
- LFS 파일은 1개만 존재하며, shallow clone 후 `git lfs pull`로 별도 다운로드 가능
- 개발 목적이라면 전체 히스토리가 필요 없으므로 shallow clone으로 충분합니다

## 실제 사례

사내 환경에서:
- ❌ `git clone https://github.com/RooCodeInc/Roo-Code.git` → 403 에러
- ❌ `GIT_LFS_SKIP_SMUDGE=1 git clone ...` → 동일한 403 에러
- ✅ `git clone --depth 1 https://github.com/RooCodeInc/Roo-Code.git` → 성공!

이것은 LFS 문제가 아니라 **큰 히스토리를 한 번에 다운로드할 때 발생하는 네트워크/서버 제한 문제**입니다.

