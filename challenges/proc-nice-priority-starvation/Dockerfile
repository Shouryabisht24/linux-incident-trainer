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
# batch-report-job is the important, fixed-priority job -- always started the
# same way, not user-configurable. telemetry-agent is started through the
# control script, which applies whatever niceness its config says. Both are
# pinned to the same core on purpose (this box's single-core-class premise,
# not something to fix) so priority actually determines who wins.
CMD ["sh","-c","setsid taskset -c 0 nice -n 0 /usr/local/bin/batch-report-job >/var/log/batch-report-job.log 2>&1 </dev/null & echo $! > /var/run/batch-report-job.pid; /usr/local/bin/svc-ctl start; exec sleep infinity"]
