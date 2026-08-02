FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# Unlike this repo's other process challenges, PID 1 here is a small reap
# loop instead of a bare `sleep infinity`. That's deliberate: this challenge
# is specifically about the pids cgroup ceiling, and a killed process that's
# never reaped stays a permanent zombie that *still counts against
# pids.current* -- which would make "clean up the leak" genuinely
# impossible to verify with this container's default PID 1. A real box
# would have an init/subreaper doing this for you; here PID 1 does it
# directly so a trainee's kill actually frees the pid slot, same as it
# would on a real host.
CMD ["sh","-c","setsid /usr/local/bin/pool-supervisor </dev/null >/var/log/pool-supervisor.log 2>&1 & echo $! > /var/run/pool-supervisor.pid; while true; do wait || sleep 1; done"]
