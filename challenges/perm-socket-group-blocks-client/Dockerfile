FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
# The daemon itself has to be a genuinely running process, started fresh at
# container start (its socket is a runtime-only object, same rule as tmpfs
# being empty at start -- there's nothing meaningful to bake into the image
# ahead of time). Its default group ownership (the daemon's own primary
# group, not the shared client group) is what actually blocks "collector" --
# see seed.sh for the full reasoning.
CMD ["sh", "-c", "setsid su -s /bin/sh metricsd -c /usr/local/bin/metricsd-daemon.sh </dev/null >>/var/log/metricsd.log 2>&1 & exec sleep infinity"]
