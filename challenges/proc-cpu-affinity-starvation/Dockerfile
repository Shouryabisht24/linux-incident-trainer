FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps util-linux && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# batch-encoder is a separate, pre-existing workload permanently pinned to
# core 0 -- it's not the thing to fix, it's the "other free cores exist but
# this box is still starved" backdrop. render-worker is started through the
# normal control script, which pins it per /etc/render-worker/render-worker.conf.
CMD ["sh","-c","taskset -c 0 /usr/local/bin/batch-encoder >/dev/null 2>&1 & /usr/local/bin/svc-ctl start; exec sleep infinity"]
