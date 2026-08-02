FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils findutils gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /var/crash is a size-bounded tmpfs, empty at container start (see
# challenge.json "tmpfs"). Run the crash loop here, at runtime, so the core
# dumps actually land against the real tmpfs rather than the build-time
# layer. Bounded iteration count (not an open-ended fill-to-ENOSPC loop) --
# each core dump is a real (partially sparse) ELF core file; empirically
# ~250 crashes are needed to actually saturate a 24MB tmpfs.
CMD ["sh","-c","mkdir -p /var/crash; i=0; while [ $i -lt 260 ]; do /usr/local/bin/worker-supervisor >/dev/null 2>&1; i=$((i+1)); done; exec sleep infinity"]
