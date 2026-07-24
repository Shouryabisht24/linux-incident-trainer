FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils lsof psmisc && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /var/log/streamer is a size-bounded tmpfs, empty at container start (see
# challenge.json "tmpfs"). Launch the streamer daemon here so it fills and
# then unlinks its own log file at runtime, not at build time.
CMD ["sh","-c","nohup /usr/local/bin/streamer >/dev/null 2>&1 & exec sleep infinity"]
